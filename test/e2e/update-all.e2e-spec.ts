import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import process from 'node:process'

import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, pathExists, readJson, remove, writeFile } from 'fs-extra'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { HomebridgeIpcService } from '../../src/core/homebridge-ipc/homebridge-ipc.service.js'
import { BackupService } from '../../src/modules/backup/backup.service.js'
import { ChildBridgesService } from '../../src/modules/child-bridges/child-bridges.service.js'
import { PluginsService } from '../../src/modules/plugins/plugins.service.js'
import { UpdateAllJournalService } from '../../src/modules/update-all/update-all-journal.service.js'
import { UpdateAllGateway } from '../../src/modules/update-all/update-all.gateway.js'
import { UpdateAllModule } from '../../src/modules/update-all/update-all.module.js'
import { UpdateAllService } from '../../src/modules/update-all/update-all.service.js'

describe('UpdateAllController (e2e)', () => {
  let app: NestFastifyApplication

  let authFilePath: string
  let secretsFilePath: string
  let journalPath: string
  let authorization: string

  let journalService: UpdateAllJournalService
  let configService: ConfigService
  let updateAllService: UpdateAllService
  let updateAllGateway: UpdateAllGateway

  // Everything the module reaches into PluginsService and BackupService for
  // is replaced - no npm registry, filesystem scanning or tarballs behind
  // these tests.
  const mockPluginsService = {
    getOutOfDatePlugins: vi.fn(),
    getHomebridgePackage: vi.fn(),
    getHomebridgeUiPackage: vi.fn(),
    getPluginChildBridgeUsernames: vi.fn(),
    performPackageUpdate: vi.fn(),
    scheduleUiRestart: vi.fn(),
    // real service exposes this as a getter; a run is refused while true
    uiRestartPending: false,
  }

  const mockBackupService = {
    runScheduledBackupJob: vi.fn(),
  }

  const mockHomebridgeIpcService = {
    restartHomebridge: vi.fn(),
  }

  const mockChildBridgesService = {
    restartChildBridge: vi.fn(),
  }

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')
    journalPath = resolve(process.env.UIX_STORAGE_PATH, '.uix-update-all-journal.json')

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [UpdateAllModule, AuthModule],
    })
      .overrideProvider(PluginsService)
      .useValue(mockPluginsService)
      .overrideProvider(BackupService)
      .useValue(mockBackupService)
      .overrideProvider(HomebridgeIpcService)
      .useValue(mockHomebridgeIpcService)
      .overrideProvider(ChildBridgesService)
      .useValue(mockChildBridgesService)
      .compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    // the same validation pipe main.ts applies
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    journalService = app.get(UpdateAllJournalService)
    configService = app.get(ConfigService)
    updateAllService = app.get(UpdateAllService)
    updateAllGateway = app.get(UpdateAllGateway)
  })

  beforeEach(async () => {
    await remove(journalPath)
    mockPluginsService.uiRestartPending = false

    // Plugins run on the main bridge unless a test says otherwise
    mockPluginsService.getPluginChildBridgeUsernames.mockResolvedValue([])

    authorization = `bearer ${(await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token}`
  })

  afterAll(async () => {
    await remove(journalPath)
    await app.close()
  })

  it('GET /update-all/journal returns null when there has never been a run', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/update-all/journal',
      headers: { authorization },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toBeNull()
  })

  it('a run round-trips through the journal and survives an app restart in spirit', async () => {
    // startRun → updateItem → finishRun → read: the write side the
    // orchestrator will use, and the read side the fresh page uses after the
    // UI restarts itself - the file IS the survival mechanism.
    const runId = await journalService.startRun([
      { type: 'plugin', name: 'homebridge-mock-plugin', from: '1.0.0', to: '1.1.0' },
      { type: 'ui', name: 'homebridge-config-ui-x', from: '5.27.0', to: '5.27.1' },
    ])

    await journalService.updateItem('homebridge-mock-plugin', 'ok', { logTail: ['installed ok'] })
    await journalService.updateItem('homebridge-config-ui-x', 'failed', { reason: 'npm exploded' })
    await journalService.finishRun({ homebridge: 'done', ui: 'not-needed' })

    const res = await app.inject({
      method: 'GET',
      path: '/update-all/journal',
      headers: { authorization },
    })

    expect(res.statusCode).toBe(200)
    const journal = res.json()
    expect(journal.runId).toBe(runId)
    expect(journal.finishedAt).toBeTruthy()
    expect(journal.items).toEqual([
      { type: 'plugin', name: 'homebridge-mock-plugin', from: '1.0.0', to: '1.1.0', status: 'ok', logTail: ['installed ok'] },
      { type: 'ui', name: 'homebridge-config-ui-x', from: '5.27.0', to: '5.27.1', status: 'failed', reason: 'npm exploded' },
    ])
    expect(journal.restart).toEqual({ homebridge: 'done', ui: 'not-needed' })
  })

  it('the removed journal/ack endpoint really is gone', async () => {
    // The summary no longer reopens after a page load, so nothing needs to
    // mark a run as seen - the endpoint was removed with that behaviour
    const ack = await app.inject({
      method: 'POST',
      path: '/update-all/journal/ack',
      headers: { authorization },
    })
    expect(ack.statusCode).toBe(404)
  })

  it('settles a journal stranded by a hard kill when the module boots', async () => {
    // The in-process crash path settles its own journal; a power cut or
    // SIGKILL cannot. At boot no run can be active, so an unfinished journal
    // is definitively dead - settle it at the source so every reader of the
    // file sees the truth, not just the modal's own interpretation
    await journalService.startRun([
      { type: 'plugin', name: 'homebridge-done', from: '1.0.0', to: '1.1.0' },
      { type: 'plugin', name: 'homebridge-stranded', from: '2.0.0', to: '2.1.0' },
    ])
    await journalService.updateItem('homebridge-done', 'ok')

    await journalService.onModuleInit()

    const journal = await journalService.read()
    expect(journal.finishedAt).toBeTruthy()
    expect(journal.items).toEqual([
      expect.objectContaining({ name: 'homebridge-done', status: 'ok' }),
      expect.objectContaining({ name: 'homebridge-stranded', status: 'skipped', reason: 'The run stopped unexpectedly before this item finished.' }),
    ])
  })

  it('leaves a finished journal alone when the module boots', async () => {
    await journalService.startRun([{ type: 'plugin', name: 'homebridge-fine', from: '1.0.0', to: '1.1.0' }])
    await journalService.updateItem('homebridge-fine', 'ok')
    await journalService.finishRun({ homebridge: 'not-needed', ui: 'not-needed' })
    const before = await journalService.read()

    await journalService.onModuleInit()

    expect(await journalService.read()).toEqual(before)
  })

  it('caps an item log tail at write time', async () => {
    await journalService.startRun([{ type: 'plugin', name: 'homebridge-mock-plugin', from: '1.0.0', to: '1.1.0' }])

    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`)
    await journalService.updateItem('homebridge-mock-plugin', 'ok', { logTail: lines })

    const journal = await journalService.read()
    expect(journal.items[0].logTail).toHaveLength(30)
    expect(journal.items[0].logTail.at(-1)).toBe('line 99')
  })

  it('a corrupt journal file reads as null rather than failing the endpoint', async () => {
    await writeFile(journalPath, 'not json {')

    const res = await app.inject({
      method: 'GET',
      path: '/update-all/journal',
      headers: { authorization },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toBeNull()
    // and the file was not deleted or replaced behind the user's back
    expect(await pathExists(journalPath)).toBe(true)
  })

  it('a journal write against a corrupt file is a no-op, not a crash', async () => {
    await writeFile(journalPath, 'not json {')

    await journalService.updateItem('anything', 'ok')

    // still the corrupt original - the mutate path skipped the write
    await expect(readJson(journalPath)).rejects.toThrow()
  })

  describe('GET /update-all/plan', () => {
    const plugin = (name: string, opts: Record<string, any> = {}) => ({
      name,
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateEngines: null,
      disabled: false,
      ...opts,
    })

    beforeEach(() => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([])
      mockPluginsService.getHomebridgePackage.mockResolvedValue({ name: 'homebridge', installedVersion: '2.3.1', latestVersion: null, updateAvailable: false })
      mockPluginsService.getHomebridgeUiPackage.mockResolvedValue({ name: 'homebridge-config-ui-x', installedVersion: '5.27.0', latestVersion: null, updateAvailable: false })
      configService.ui.plugins = { hideUpdatesFor: [] }
    })

    const getPlan = async () => {
      const res = await app.inject({
        method: 'GET',
        path: '/update-all/plan',
        headers: { authorization },
      })
      expect(res.statusCode).toBe(200)
      return res.json()
    }

    it('returns an empty plan when nothing is out of date', async () => {
      expect(await getPlan()).toEqual({ items: [], needsReview: [], skipped: [] })
    })

    it('orders items Homebridge, then the UI, then plugins A→Z', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([
        plugin('homebridge-zeta'),
        plugin('homebridge-alpha'),
      ])
      mockPluginsService.getHomebridgePackage.mockResolvedValue({ name: 'homebridge', installedVersion: '2.3.1', latestVersion: '2.3.2', updateAvailable: true })
      mockPluginsService.getHomebridgeUiPackage.mockResolvedValue({ name: 'homebridge-config-ui-x', installedVersion: '5.27.0', latestVersion: '5.27.1', updateAvailable: true })

      const { items, needsReview, skipped } = await getPlan()
      expect(items.map((x: any) => [x.type, x.name])).toEqual([
        ['homebridge', 'homebridge'],
        ['ui', 'homebridge-config-ui-x'],
        ['plugin', 'homebridge-alpha'],
        ['plugin', 'homebridge-zeta'],
      ])
      expect(items[2]).toMatchObject({ from: '1.0.0', to: '1.1.0' })
      expect(needsReview).toEqual([])
      expect(skipped).toEqual([])
    })

    it('annotates each plugin item with its child bridges, so the modal can predict the restart', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([
        plugin('homebridge-childed'),
        plugin('homebridge-excluded'),
        plugin('homebridge-mainbridge'),
      ])
      configService.ui.plugins = { hideUpdatesFor: ['homebridge-excluded'] }
      mockPluginsService.getPluginChildBridgeUsernames.mockImplementation(async (name: string) =>
        name === 'homebridge-childed' ? ['0E:AA:AA:AA:AA:AA', '0E:BB:BB:BB:BB:BB'] : [])

      const { items, skipped } = await getPlan()
      expect(items).toEqual([
        expect.objectContaining({ name: 'homebridge-childed', childBridgeUsernames: ['0E:AA:AA:AA:AA:AA', '0E:BB:BB:BB:BB:BB'] }),
        expect.objectContaining({ name: 'homebridge-mainbridge', childBridgeUsernames: [] }),
      ])
      expect(skipped).toEqual([expect.objectContaining({ name: 'homebridge-excluded', childBridgeUsernames: [] })])
      // Excluded items cannot be selected, so their bridges are never looked up
      expect(mockPluginsService.getPluginChildBridgeUsernames).not.toHaveBeenCalledWith('homebridge-excluded')
    })

    it('skips a plugin whose updates the user has hidden, with reason hidden', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-hush')])
      configService.ui.plugins = { hideUpdatesFor: ['homebridge-hush'] }

      const { items, skipped } = await getPlan()
      expect(items).toEqual([])
      expect(skipped).toEqual([expect.objectContaining({ name: 'homebridge-hush', reason: 'hidden' })])
    })

    it('skips a disabled plugin, with reason disabled', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-off', { disabled: true })])

      const { items, skipped } = await getPlan()
      expect(items).toEqual([])
      expect(skipped).toEqual([expect.objectContaining({ name: 'homebridge-off', reason: 'disabled' })])
    })

    it('moves a major version jump to needsReview', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-big', { latestVersion: '2.0.0' })])

      const { items, needsReview, skipped } = await getPlan()
      expect(items).toEqual([])
      expect(skipped).toEqual([])
      expect(needsReview).toEqual([expect.objectContaining({ name: 'homebridge-big', from: '1.0.0', to: '2.0.0', reason: 'major' })])
    })

    it('skips an engines-incompatible update, and keeps a compatible one', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([
        plugin('homebridge-future-node', { updateEngines: { node: '>=99.0.0' } }),
        plugin('homebridge-future-hb', { updateEngines: { homebridge: '>=99.0.0' } }),
        plugin('homebridge-fine', { updateEngines: { node: '>=18.0.0' } }),
      ])

      const { items, skipped } = await getPlan()
      expect(items).toEqual([expect.objectContaining({ name: 'homebridge-fine' })])
      expect(skipped.map((x: any) => [x.name, x.reason])).toEqual([
        ['homebridge-future-hb', 'engines'],
        ['homebridge-future-node', 'engines'],
      ])
    })

    it('applies the engines check to the ui package too', async () => {
      // Regression: the ui item used to pass homebridgeVersion: null, which
      // silently disabled the engines.homebridge half of the check - a new UI
      // requiring a newer Homebridge sailed into the plan while the
      // single-update flow refused the same update
      mockPluginsService.getHomebridgeUiPackage.mockResolvedValue({
        name: 'homebridge-config-ui-x',
        installedVersion: '5.27.0',
        latestVersion: '5.27.1',
        updateAvailable: true,
        updateEngines: { homebridge: '>=99.0.0' },
      })

      const { items, skipped } = await getPlan()
      expect(items).toEqual([])
      expect(skipped).toEqual([expect.objectContaining({ name: 'homebridge-config-ui-x', reason: 'engines' })])
    })

    it('reports only the first matching exclusion reason', async () => {
      // hidden + disabled + major all apply - hidden wins, and the item does
      // not also show up under needsReview
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([
        plugin('homebridge-multi', { disabled: true, latestVersion: '2.0.0' }),
      ])
      configService.ui.plugins = { hideUpdatesFor: ['homebridge-multi'] }

      const { needsReview, skipped } = await getPlan()
      expect(needsReview).toEqual([])
      expect(skipped).toEqual([expect.objectContaining({ name: 'homebridge-multi', reason: 'hidden' })])
    })

    it('plans the UI only once, even though it also appears in the plugin list', async () => {
      // the UI carries the homebridge-plugin keyword, so getOutOfDatePlugins
      // returns it alongside real plugins
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-config-ui-x', { installedVersion: '5.27.0', latestVersion: '5.27.1' })])
      mockPluginsService.getHomebridgeUiPackage.mockResolvedValue({ name: 'homebridge-config-ui-x', installedVersion: '5.27.0', latestVersion: '5.27.1', updateAvailable: true })

      const { items } = await getPlan()
      expect(items).toEqual([expect.objectContaining({ type: 'ui', name: 'homebridge-config-ui-x' })])
    })

    it('still plans plugin updates when the Homebridge package cannot be resolved', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-survivor')])
      mockPluginsService.getHomebridgePackage.mockRejectedValue(new Error('Unable To Find Homebridge Installation.'))

      const { items } = await getPlan()
      expect(items).toEqual([expect.objectContaining({ name: 'homebridge-survivor' })])
    })

    it('rejects an unauthenticated caller', async () => {
      const res = await app.inject({
        method: 'GET',
        path: '/update-all/plan',
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /update-all/start + cancel', () => {
    const plugin = (name: string, opts: Record<string, any> = {}) => ({
      name,
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateEngines: null,
      disabled: false,
      ...opts,
    })

    const okUpdate = (name: string, version: string, restart: Record<string, any> = {}) => ({
      ok: true,
      name,
      version,
      restart: { homebridge: false, ui: false, childBridgeUsernames: [], ...restart },
    })

    const deferred = () => {
      let resolve: () => void
      const promise = new Promise<void>((res) => {
        resolve = res
      })
      return { promise, resolve }
    }

    beforeEach(() => {
      // reset drops call history AND any leftover mockImplementationOnce a
      // previous test queued but never consumed
      mockPluginsService.performPackageUpdate.mockReset()
      mockPluginsService.scheduleUiRestart.mockReset()
      mockHomebridgeIpcService.restartHomebridge.mockReset()
      mockHomebridgeIpcService.restartHomebridge.mockReturnValue(true)
      mockChildBridgesService.restartChildBridge.mockReset()
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([])
      mockPluginsService.getHomebridgePackage.mockResolvedValue({ name: 'homebridge', installedVersion: '2.3.1', latestVersion: null, updateAvailable: false })
      mockPluginsService.getHomebridgeUiPackage.mockResolvedValue({ name: 'homebridge-config-ui-x', installedVersion: '5.27.0', latestVersion: null, updateAvailable: false })
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string) => {
        if (name === 'homebridge-config-ui-x') {
          return okUpdate(name, version, { ui: true })
        }
        return okUpdate(name, version, { homebridge: true })
      })
      mockBackupService.runScheduledBackupJob.mockClear()
      mockBackupService.runScheduledBackupJob.mockResolvedValue(undefined)
      configService.ui.plugins = { hideUpdatesFor: [] }
    })

    const startRun = async (items: { name: string, to: string }[]) => {
      return await app.inject({
        method: 'POST',
        path: '/update-all/start',
        headers: { authorization },
        payload: { items },
      })
    }

    const readJournal = async () => {
      const res = await app.inject({
        method: 'GET',
        path: '/update-all/journal',
        headers: { authorization },
      })
      expect(res.statusCode).toBe(200)
      return res.json()
    }

    it('runs the confirmed items serially, after a backup, and journals every step', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-beta'), plugin('homebridge-alpha')])
      mockPluginsService.getHomebridgePackage.mockResolvedValue({ name: 'homebridge', installedVersion: '2.3.1', latestVersion: '2.3.2', updateAvailable: true })
      mockPluginsService.getHomebridgeUiPackage.mockResolvedValue({ name: 'homebridge-config-ui-x', installedVersion: '5.27.0', latestVersion: '5.27.1', updateAvailable: true })

      const res = await startRun([
        { name: 'homebridge-alpha', to: '1.1.0' },
        { name: 'homebridge-beta', to: '1.1.0' },
        { name: 'homebridge', to: '2.3.2' },
        { name: 'homebridge-config-ui-x', to: '5.27.1' },
      ])
      expect(res.statusCode).toBe(201)
      expect(res.json().runId).toBeTruthy()

      await updateAllService.waitForActiveRun()

      const journal = await readJournal()
      expect(journal.runId).toBe(res.json().runId)
      expect(journal.finishedAt).toBeTruthy()
      expect(journal.items.map((x: any) => [x.name, x.status])).toEqual([
        ['homebridge', 'ok'],
        ['homebridge-config-ui-x', 'ok'],
        ['homebridge-alpha', 'ok'],
        ['homebridge-beta', 'ok'],
      ])
      // The UI is in this run, and its own restart is the widest of the three -
      // it takes Homebridge and every child bridge with it, so no separate
      // Homebridge restart is issued on top
      expect(journal.restart).toEqual({ homebridge: 'not-needed', ui: 'scheduled', childBridges: 'not-needed' })
      expect(mockHomebridgeIpcService.restartHomebridge).not.toHaveBeenCalled()
      expect(mockPluginsService.scheduleUiRestart).toHaveBeenCalledTimes(1)

      // the backup ran once, before any update touched the instance
      expect(mockBackupService.runScheduledBackupJob).toHaveBeenCalledTimes(1)
      expect(mockBackupService.runScheduledBackupJob.mock.invocationCallOrder[0])
        .toBeLessThan(mockPluginsService.performPackageUpdate.mock.invocationCallOrder[0])
    })

    it('a failed plugin does not stop the rest, and carries its output into the journal', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-broken'), plugin('homebridge-working')])
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string, client: any) => {
        if (name === 'homebridge-broken') {
          client.emit('stdout', 'npm ERR! code E404\nnpm ERR! not found\n')
          return { ok: false, name, version, error: 'npm exploded', restart: { homebridge: false, ui: false, childBridgeUsernames: [] } }
        }
        return okUpdate(name, version, { homebridge: true })
      })

      const res = await startRun([
        { name: 'homebridge-broken', to: '1.1.0' },
        { name: 'homebridge-working', to: '1.1.0' },
      ])
      expect(res.statusCode).toBe(201)
      await updateAllService.waitForActiveRun()

      const journal = await readJournal()
      expect(journal.items).toEqual([
        expect.objectContaining({ name: 'homebridge-broken', status: 'failed', reason: 'npm exploded', logTail: ['npm ERR! code E404', 'npm ERR! not found'] }),
        expect.objectContaining({ name: 'homebridge-working', status: 'ok' }),
      ])
      expect(journal.restart.homebridge).toBe('done')
    })

    it('a failed Homebridge update skips the UI update, and says so', async () => {
      mockPluginsService.getHomebridgePackage.mockResolvedValue({ name: 'homebridge', installedVersion: '2.3.1', latestVersion: '2.3.2', updateAvailable: true })
      mockPluginsService.getHomebridgeUiPackage.mockResolvedValue({ name: 'homebridge-config-ui-x', installedVersion: '5.27.0', latestVersion: '5.27.1', updateAvailable: true })
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string) => {
        return { ok: false, name, version, error: 'npm exploded', restart: { homebridge: false, ui: false, childBridgeUsernames: [] } }
      })

      const res = await startRun([
        { name: 'homebridge', to: '2.3.2' },
        { name: 'homebridge-config-ui-x', to: '5.27.1' },
      ])
      expect(res.statusCode).toBe(201)
      await updateAllService.waitForActiveRun()

      const journal = await readJournal()
      expect(journal.items).toEqual([
        expect.objectContaining({ name: 'homebridge', status: 'failed' }),
        expect.objectContaining({ name: 'homebridge-config-ui-x', status: 'skipped', reason: 'Skipped because the Homebridge update failed.' }),
      ])
      expect(mockPluginsService.performPackageUpdate).toHaveBeenCalledTimes(1)
      expect(journal.restart).toEqual({ homebridge: 'not-needed', ui: 'not-needed', childBridges: 'not-needed' })
      expect(mockHomebridgeIpcService.restartHomebridge).not.toHaveBeenCalled()
      expect(mockPluginsService.scheduleUiRestart).not.toHaveBeenCalled()
    })

    it('two concurrent starts: exactly one runs, the other gets 409, and the slot is released after', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-slow')])
      const gate = deferred()
      mockPluginsService.performPackageUpdate.mockImplementationOnce(async (name: string, version: string) => {
        await gate.promise
        return okUpdate(name, version, { homebridge: true })
      })

      const first = await startRun([{ name: 'homebridge-slow', to: '1.1.0' }])
      expect(first.statusCode).toBe(201)

      const second = await startRun([{ name: 'homebridge-slow', to: '1.1.0' }])
      expect(second.statusCode).toBe(409)

      gate.resolve()
      await updateAllService.waitForActiveRun()

      // slot released - a new run is allowed again
      const third = await startRun([{ name: 'homebridge-slow', to: '1.1.0' }])
      expect(third.statusCode).toBe(201)
      await updateAllService.waitForActiveRun()
    })

    it('cancel takes effect between items and leaves an honest journal', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-first'), plugin('homebridge-second')])
      const gate = deferred()
      mockPluginsService.performPackageUpdate.mockImplementationOnce(async (name: string, version: string) => {
        await gate.promise
        return okUpdate(name, version, { homebridge: true })
      })

      const res = await startRun([
        { name: 'homebridge-first', to: '1.1.0' },
        { name: 'homebridge-second', to: '1.1.0' },
      ])
      expect(res.statusCode).toBe(201)

      const cancel = await app.inject({
        method: 'POST',
        path: '/update-all/cancel',
        headers: { authorization },
      })
      expect(cancel.statusCode).toBe(201)

      gate.resolve()
      await updateAllService.waitForActiveRun()

      const journal = await readJournal()
      expect(journal.items).toEqual([
        expect.objectContaining({ name: 'homebridge-first', status: 'ok' }),
        expect.objectContaining({ name: 'homebridge-second', status: 'skipped', reason: 'Run cancelled by the user.' }),
      ])
      expect(mockPluginsService.performPackageUpdate).toHaveBeenCalledTimes(1)
      expect(journal.finishedAt).toBeTruthy()
    })

    it('a crash in the run machinery settles the journal instead of stranding items', async () => {
      // The backup step is the only pre-loop await - rejecting it simulates
      // the loop machinery itself dying (not an item failure, which the loop
      // handles). The journal must still read as a finished run.
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-stranded')])
      mockBackupService.runScheduledBackupJob.mockRejectedValue(new Error('disk gone'))

      const res = await startRun([{ name: 'homebridge-stranded', to: '1.1.0' }])
      expect(res.statusCode).toBe(201)
      await updateAllService.waitForActiveRun()

      const journal = await readJournal()
      expect(journal.finishedAt).toBeTruthy()
      expect(journal.items).toEqual([
        expect.objectContaining({ name: 'homebridge-stranded', status: 'skipped', reason: 'The run stopped unexpectedly before this item.' }),
      ])
      expect(mockPluginsService.performPackageUpdate).not.toHaveBeenCalled()

      // and the slot is free for the next run
      mockBackupService.runScheduledBackupJob.mockResolvedValue(undefined)
      const retry = await startRun([{ name: 'homebridge-stranded', to: '1.1.0' }])
      expect(retry.statusCode).toBe(201)
      await updateAllService.waitForActiveRun()
    })

    it('a cancel during the final item still restarts what completed', async () => {
      // Cancel takes effect between items - arriving while the LAST item is
      // mid-npm means nothing is left to skip, and the finale must still
      // apply the restart the completed updates call for.
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-last')])
      const gate = deferred()
      mockPluginsService.performPackageUpdate.mockImplementationOnce(async (name: string, version: string) => {
        await gate.promise
        return okUpdate(name, version, { homebridge: true })
      })

      const res = await startRun([{ name: 'homebridge-last', to: '1.1.0' }])
      expect(res.statusCode).toBe(201)

      const cancel = await app.inject({
        method: 'POST',
        path: '/update-all/cancel',
        headers: { authorization },
      })
      expect(cancel.statusCode).toBe(201)

      gate.resolve()
      await updateAllService.waitForActiveRun()

      const journal = await readJournal()
      expect(journal.items).toEqual([expect.objectContaining({ name: 'homebridge-last', status: 'ok' })])
      expect(journal.restart.homebridge).toBe('done')
      expect(mockHomebridgeIpcService.restartHomebridge).toHaveBeenCalledTimes(1)
    })

    it('refuses to start while a ui self-restart fuse is armed', async () => {
      // Regression: a single-item UI update arms a 5s process exit; a run
      // started inside that window used to be truncated mid-way when the
      // exit fired between items
      mockPluginsService.uiRestartPending = true
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-late')])

      const res = await app.inject({
        method: 'POST',
        path: '/update-all/start',
        headers: { authorization },
        payload: { items: [{ name: 'homebridge-late', to: '1.1.0' }] },
      })

      expect(res.statusCode).toBe(409)
    })

    it('rejects a cancel when no run is active', async () => {
      const res = await app.inject({
        method: 'POST',
        path: '/update-all/cancel',
        headers: { authorization },
      })

      expect(res.statusCode).toBe(400)
    })

    it('rejects an item that is not in the current plan, and releases the slot', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-real')])

      const res = await startRun([{ name: 'homebridge-imaginary', to: '1.1.0' }])
      expect(res.statusCode).toBe(400)
      expect(mockPluginsService.performPackageUpdate).not.toHaveBeenCalled()

      // the failed validation must not wedge future runs
      const retry = await startRun([{ name: 'homebridge-real', to: '1.1.0' }])
      expect(retry.statusCode).toBe(201)
      await updateAllService.waitForActiveRun()
    })

    it('rejects an item whose target version no longer matches the plan', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-moved', { latestVersion: '1.2.0' })])

      const res = await startRun([{ name: 'homebridge-moved', to: '1.1.0' }])
      expect(res.statusCode).toBe(400)
      expect(mockPluginsService.performPackageUpdate).not.toHaveBeenCalled()
    })

    it('rejects an empty confirmed list', async () => {
      const res = await startRun([])
      expect(res.statusCode).toBe(400)
    })

    it('rejects an unauthenticated caller', async () => {
      const res = await app.inject({
        method: 'POST',
        path: '/update-all/start',
        payload: { items: [{ name: 'homebridge-x', to: '1.1.0' }] },
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('finale ordering + smallest covering restart', () => {
    const plugin = (name: string, opts: Record<string, any> = {}) => ({
      name,
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateEngines: null,
      disabled: false,
      ...opts,
    })

    const okUpdate = (name: string, version: string, restart: Record<string, any> = {}) => ({
      ok: true,
      name,
      version,
      restart: { homebridge: false, ui: false, childBridgeUsernames: [], ...restart },
    })

    const startRun = async (items: { name: string, to: string }[]) => {
      const res = await app.inject({
        method: 'POST',
        path: '/update-all/start',
        headers: { authorization },
        payload: { items },
      })
      expect(res.statusCode).toBe(201)
      await updateAllService.waitForActiveRun()
    }

    beforeEach(() => {
      mockPluginsService.performPackageUpdate.mockReset()
      mockPluginsService.scheduleUiRestart.mockReset()
      mockHomebridgeIpcService.restartHomebridge.mockReset()
      mockHomebridgeIpcService.restartHomebridge.mockReturnValue(true)
      mockChildBridgesService.restartChildBridge.mockReset()
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([])
      mockPluginsService.getHomebridgePackage.mockResolvedValue({ name: 'homebridge', installedVersion: '2.3.1', latestVersion: null, updateAvailable: false })
      mockPluginsService.getHomebridgeUiPackage.mockResolvedValue({ name: 'homebridge-config-ui-x', installedVersion: '5.27.0', latestVersion: null, updateAvailable: false })
      mockBackupService.runScheduledBackupJob.mockResolvedValue(undefined)
      configService.ui.plugins = { hideUpdatesFor: [] }
    })

    it('the journal is on disk before the UI exit timer is armed', async () => {
      mockPluginsService.getHomebridgeUiPackage.mockResolvedValue({ name: 'homebridge-config-ui-x', installedVersion: '5.27.0', latestVersion: '5.27.1', updateAvailable: true })
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string) => okUpdate(name, version, { ui: true }))

      const finishRunSpy = vi.spyOn(journalService, 'finishRun')
      try {
        await startRun([{ name: 'homebridge-config-ui-x', to: '5.27.1' }])

        expect(finishRunSpy).toHaveBeenCalledTimes(1)
        expect(mockPluginsService.scheduleUiRestart).toHaveBeenCalledTimes(1)
        expect(finishRunSpy.mock.invocationCallOrder[0])
          .toBeLessThan(mockPluginsService.scheduleUiRestart.mock.invocationCallOrder[0])
      } finally {
        finishRunSpy.mockRestore()
      }

      // a UI-only update needs no Homebridge restart at all
      expect(mockHomebridgeIpcService.restartHomebridge).not.toHaveBeenCalled()
      expect((await journalService.read()).restart).toEqual({ homebridge: 'not-needed', ui: 'scheduled', childBridges: 'not-needed' })
    })

    it('records a homebridge restart that could not be issued as failed', async () => {
      // Regression: restartHomebridge() reports rather than throws - false
      // (no process attached) used to be recorded as 'done', and the modal
      // then sent the user to a restart page for a restart that never happened
      mockHomebridgeIpcService.restartHomebridge.mockReturnValue(false)
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-main')])
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string) => okUpdate(name, version, { homebridge: true }))

      await startRun([{ name: 'homebridge-main', to: '1.1.0' }])

      expect((await journalService.read()).restart.homebridge).toBe('failed')
    })

    it('keeps restarting the remaining child bridges when one restart throws', async () => {
      // Regression: the try used to wrap the whole loop, so the first throw
      // abandoned every later bridge and reported the already-restarted ones
      // as failed with it
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([
        plugin('homebridge-a'),
        plugin('homebridge-b'),
        plugin('homebridge-c'),
      ])
      mockPluginsService.getPluginChildBridgeUsernames.mockImplementation(async (name: string) => [`0E:00:00:00:00:0${name.at(-1).toUpperCase()}`])
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string) => (
        okUpdate(name, version, { childBridgeUsernames: [`0E:00:00:00:00:0${name.at(-1).toUpperCase()}`] })
      ))
      mockChildBridgesService.restartChildBridge.mockImplementation((username: string) => {
        if (username.endsWith('B')) {
          throw new Error('ipc dropped')
        }
      })

      await startRun([
        { name: 'homebridge-a', to: '1.1.0' },
        { name: 'homebridge-b', to: '1.1.0' },
        { name: 'homebridge-c', to: '1.1.0' },
      ])

      // every bridge was attempted, and the one failure is recorded
      expect(mockChildBridgesService.restartChildBridge).toHaveBeenCalledTimes(3)
      expect((await journalService.read()).restart.childBridges).toBe('failed')
    })

    /**
     * ⚠️ The three restart scopes contain each other. The UI restarting itself
     * ends the process hb-service runs it in, and that process owns Homebridge,
     * so Homebridge and every child bridge come back with it. Restarting the
     * child bridges here would tear them down seconds before the service did
     * it anyway.
     */
    it('issues no child bridge restarts when the ui is restarting too', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-bridged')])
      mockPluginsService.getHomebridgeUiPackage.mockResolvedValue({ name: 'homebridge-config-ui-x', installedVersion: '5.27.0', latestVersion: '5.27.1', updateAvailable: true })
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string) => (
        name === 'homebridge-config-ui-x'
          ? okUpdate(name, version, { ui: true })
          : okUpdate(name, version, { childBridgeUsernames: ['AA:BB:CC:DD:EE:FF'] })
      ))

      await startRun([
        { name: 'homebridge-config-ui-x', to: '5.27.1' },
        { name: 'homebridge-bridged', to: '1.1.0' },
      ])
      await updateAllService.waitForActiveRun()

      expect(mockChildBridgesService.restartChildBridge).not.toHaveBeenCalled()
      expect(mockHomebridgeIpcService.restartHomebridge).not.toHaveBeenCalled()
      expect(mockPluginsService.scheduleUiRestart).toHaveBeenCalledTimes(1)
      expect((await journalService.read()).restart).toEqual({ homebridge: 'not-needed', ui: 'scheduled', childBridges: 'not-needed' })
    })

    it('no restart of any kind when nothing updated successfully', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-doomed')])
      mockPluginsService.performPackageUpdate.mockResolvedValue({ ok: false, name: 'homebridge-doomed', version: '1.1.0', error: 'npm exploded', restart: { homebridge: false, ui: false, childBridgeUsernames: [] } })

      await startRun([{ name: 'homebridge-doomed', to: '1.1.0' }])

      expect(mockHomebridgeIpcService.restartHomebridge).not.toHaveBeenCalled()
      expect(mockChildBridgesService.restartChildBridge).not.toHaveBeenCalled()
      expect(mockPluginsService.scheduleUiRestart).not.toHaveBeenCalled()
      expect((await journalService.read()).restart).toEqual({ homebridge: 'not-needed', ui: 'not-needed', childBridges: 'not-needed' })
    })

    it('restarts only the child bridges when every updated plugin runs in one', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-bridged')])
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string) =>
        okUpdate(name, version, { childBridgeUsernames: ['0E:AA:AA:AA:AA:AA', '0E:BB:BB:BB:BB:BB'] }))

      await startRun([{ name: 'homebridge-bridged', to: '1.1.0' }])

      expect(mockHomebridgeIpcService.restartHomebridge).not.toHaveBeenCalled()
      expect(mockChildBridgesService.restartChildBridge.mock.calls.map(x => x[0]).sort())
        .toEqual(['0E:AA:AA:AA:AA:AA', '0E:BB:BB:BB:BB:BB'])
      expect((await journalService.read()).restart).toEqual({ homebridge: 'not-needed', ui: 'not-needed', childBridges: 'done' })
    })

    it('a full restart covers everything - no separate child bridge restarts on top', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-bridged'), plugin('homebridge-main')])
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string) => {
        if (name === 'homebridge-bridged') {
          return okUpdate(name, version, { childBridgeUsernames: ['0E:AA:AA:AA:AA:AA'] })
        }
        return okUpdate(name, version, { homebridge: true })
      })

      await startRun([
        { name: 'homebridge-bridged', to: '1.1.0' },
        { name: 'homebridge-main', to: '1.1.0' },
      ])

      expect(mockHomebridgeIpcService.restartHomebridge).toHaveBeenCalledTimes(1)
      expect(mockChildBridgesService.restartChildBridge).not.toHaveBeenCalled()
      expect((await journalService.read()).restart).toEqual({ homebridge: 'done', ui: 'not-needed', childBridges: 'not-needed' })
    })

    it('a failed Homebridge restart is recorded and does not block the journal write', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-main')])
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string) => okUpdate(name, version, { homebridge: true }))
      mockHomebridgeIpcService.restartHomebridge.mockImplementation(() => {
        throw new Error('ipc gone')
      })

      await startRun([{ name: 'homebridge-main', to: '1.1.0' }])

      const journal = await journalService.read()
      expect(journal.finishedAt).toBeTruthy()
      expect(journal.restart).toEqual({ homebridge: 'failed', ui: 'not-needed', childBridges: 'not-needed' })
    })
  })

  describe('progress gateway', () => {
    const plugin = (name: string, opts: Record<string, any> = {}) => ({
      name,
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateEngines: null,
      disabled: false,
      ...opts,
    })

    const okUpdate = (name: string, version: string) => ({
      ok: true,
      name,
      version,
      restart: { homebridge: true, ui: false, childBridgeUsernames: [] },
    })

    const deferred = () => {
      let resolve: () => void
      const promise = new Promise<void>((res) => {
        resolve = res
      })
      return { promise, resolve }
    }

    const activeClients: EventEmitter[] = []

    const makeWsClient = () => {
      const client = new EventEmitter()
      const received: [string, any][] = []
      for (const event of ['item-start', 'stdout', 'item-result', 'run-complete']) {
        client.on(event, (payload: any) => received.push([event, payload]))
      }
      activeClients.push(client)
      return { client, received }
    }

    const startRun = async (items: { name: string, to: string }[]) => {
      return await app.inject({
        method: 'POST',
        path: '/update-all/start',
        headers: { authorization },
        payload: { items },
      })
    }

    beforeEach(() => {
      mockPluginsService.performPackageUpdate.mockReset()
      mockPluginsService.scheduleUiRestart.mockReset()
      mockHomebridgeIpcService.restartHomebridge.mockReset()
      mockHomebridgeIpcService.restartHomebridge.mockReturnValue(true)
      mockChildBridgesService.restartChildBridge.mockReset()
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([])
      mockPluginsService.getHomebridgePackage.mockResolvedValue({ name: 'homebridge', installedVersion: '2.3.1', latestVersion: null, updateAvailable: false })
      mockPluginsService.getHomebridgeUiPackage.mockResolvedValue({ name: 'homebridge-config-ui-x', installedVersion: '5.27.0', latestVersion: null, updateAvailable: false })
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string) => okUpdate(name, version))
      mockBackupService.runScheduledBackupJob.mockResolvedValue(undefined)
      configService.ui.plugins = { hideUpdatesFor: [] }
    })

    afterEach(() => {
      // unhook every fake socket so no test leaks its subscriber into the next
      for (const client of activeClients) {
        try {
          client.emit('disconnect')
        } catch {}
      }
      activeClients.length = 0
    })

    it('subscribe returns an idle snapshot when nothing is running', async () => {
      const { client } = makeWsClient()

      const snapshot: any = await updateAllGateway.subscribe(client)

      expect(snapshot.active).toBe(false)
      expect(snapshot.journal).toBeNull()
    })

    it('repeated subscribes on one socket do not stack cleanup listeners', async () => {
      // Regression: every subscribe used to add another disconnect listener
      // to the same socket (the browser re-subscribes per reconnect and per
      // run started), marching toward MaxListenersExceeded
      const { client } = makeWsClient()

      for (let i = 0; i < 5; i++) {
        await updateAllGateway.subscribe(client)
      }

      expect(client.listenerCount('disconnect')).toBe(1)
      expect(client.listenerCount('end')).toBe(1)
    })

    it('a client that ends without disconnecting is unsubscribed', async () => {
      // `end` is what the UI emits when the modal closes over the still-open
      // socket - without handling it, a closed modal stayed subscribed for
      // the life of the connection
      const { client, received } = makeWsClient()
      await updateAllGateway.subscribe(client)

      client.emit('end')

      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-after-end')])
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string) => okUpdate(name, version))
      const res = await startRun([{ name: 'homebridge-after-end', to: '1.1.0' }])
      expect(res.statusCode).toBe(201)
      await updateAllService.waitForActiveRun()

      expect(received).toEqual([])
    })

    it('a subscriber sees the full event stream, in run order', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-noisy')])
      mockPluginsService.performPackageUpdate.mockImplementation(async (name: string, version: string, wsClient: any) => {
        wsClient.emit('stdout', 'installing...\n')
        return okUpdate(name, version)
      })

      const { client, received } = makeWsClient()
      await updateAllGateway.subscribe(client)

      const res = await startRun([{ name: 'homebridge-noisy', to: '1.1.0' }])
      expect(res.statusCode).toBe(201)
      await updateAllService.waitForActiveRun()

      expect(received).toEqual([
        ['item-start', { name: 'homebridge-noisy' }],
        ['stdout', { name: 'homebridge-noisy', data: 'installing...\n' }],
        ['item-result', { name: 'homebridge-noisy', status: 'ok' }],
        ['run-complete', { runId: res.json().runId }],
      ])
    })

    it('a client joining mid-run gets a snapshot of progress so far, then the live events', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-slow')])
      const gate = deferred()
      const entered = deferred()
      mockPluginsService.performPackageUpdate.mockImplementationOnce(async (name: string, version: string) => {
        entered.resolve()
        await gate.promise
        return okUpdate(name, version)
      })

      const res = await startRun([{ name: 'homebridge-slow', to: '1.1.0' }])
      expect(res.statusCode).toBe(201)
      await entered.promise

      const { client, received } = makeWsClient()
      const snapshot: any = await updateAllGateway.subscribe(client)
      expect(snapshot.active).toBe(true)
      expect(snapshot.journal.items).toEqual([expect.objectContaining({ name: 'homebridge-slow', status: 'running' })])

      gate.resolve()
      await updateAllService.waitForActiveRun()

      expect(received).toEqual([
        ['item-result', { name: 'homebridge-slow', status: 'ok' }],
        ['run-complete', { runId: res.json().runId }],
      ])
    })

    it('one broken subscriber cannot break the run or the other subscribers', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-steady')])

      const broken = new EventEmitter()
      broken.emit = () => {
        throw new Error('socket exploded')
      }
      activeClients.push(broken)
      await updateAllGateway.subscribe(broken)

      const { client, received } = makeWsClient()
      await updateAllGateway.subscribe(client)

      const res = await startRun([{ name: 'homebridge-steady', to: '1.1.0' }])
      expect(res.statusCode).toBe(201)
      await updateAllService.waitForActiveRun()

      // the healthy subscriber still saw the whole run
      expect(received.map(x => x[0])).toEqual(['item-start', 'item-result', 'run-complete'])
      // and the run itself finished cleanly
      const journal = await journalService.read()
      expect(journal.items[0].status).toBe('ok')
      expect(journal.finishedAt).toBeTruthy()
    })

    it('a disconnected client receives nothing further', async () => {
      mockPluginsService.getOutOfDatePlugins.mockResolvedValue([plugin('homebridge-quiet')])

      const { client, received } = makeWsClient()
      await updateAllGateway.subscribe(client)
      client.emit('disconnect')

      const res = await startRun([{ name: 'homebridge-quiet', to: '1.1.0' }])
      expect(res.statusCode).toBe(201)
      await updateAllService.waitForActiveRun()

      expect(received).toEqual([])
    })

    it('a malformed subscriber cannot reject unhandled', async () => {
      // a client object without the expected socket shape - the handler must
      // return an error, not throw (vitest fails the suite on unhandled
      // rejections, so simply reaching the assertions proves it)
      const result: any = await updateAllGateway.subscribe({} as any)
      expect(result.constructor.name).toBe('WsException')
      // and over the socket.io ack the exception serialises with the `error`
      // property the ws.service client checks - pin that so a nestjs upgrade
      // changing the shape fails here rather than silently succeeding with
      // an empty snapshot in the browser
      expect(JSON.parse(JSON.stringify(result))).toMatchObject({ error: expect.any(String) })
    })
  })

  it('rejects an unauthenticated caller', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/update-all/journal',
    })

    expect(res.statusCode).toBe(401)
  })

  it('rejects a non-admin caller', async () => {
    const { AuthService } = await import('../../src/core/auth/auth.service.js')
    const authService = app.get(AuthService)
    const user = await authService.addUser({
      name: 'Update All User',
      username: 'update-all-user',
      password: 'update-all-password',
      admin: false,
    } as any)

    try {
      const token = (await authService.signIn('update-all-user', 'update-all-password')).access_token
      const res = await app.inject({
        method: 'GET',
        path: '/update-all/journal',
        headers: { authorization: `bearer ${token}` },
      })

      expect(res.statusCode).toBe(403)
    } finally {
      await authService.deleteUser(user.id)
    }
  })
})
