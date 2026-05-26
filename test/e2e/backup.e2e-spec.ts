import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'
import type { Mock } from 'vitest'

import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { lstat, mkdtemp, symlink, writeFile as writeFileAsync } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import fastifyMultipart from '@fastify/multipart'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import dayjs from 'dayjs'
import FormData from 'form-data'
import {
  closeSync,
  copy,
  emptyDir,
  emptyDirSync,
  ensureDir,
  openSync,
  pathExists,
  readdir,
  readFile,
  readJson,
  remove,
  writeFile,
  writeJson,
  writeSync,
} from 'fs-extra'
import { create as tarCreate } from 'tar'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { SchedulerService } from '../../src/core/scheduler/scheduler.service.js'
import { BackupGateway } from '../../src/modules/backup/backup.gateway.js'
import { BackupModule } from '../../src/modules/backup/backup.module.js'
import { BackupService } from '../../src/modules/backup/backup.service.js'
import { PluginsService } from '../../src/modules/plugins/plugins.service.js'

import '../../src/global-defaults.js'

const RE_COLON = /:/g

vi.spyOn(globalThis.console, 'error')

// Function code taken from http://blog.tompawlak.org/how-to-generate-random-values-nodejs-javascript
function randomValueHex(len: number) {
  return crypto.randomBytes(Math.ceil(len / 2))
    .toString('hex') // convert to hexadecimal format
    .slice(0, len)
    .toUpperCase() // return required number of characters
}

describe('BackupController (e2e)', { timeout: 10_000 }, () => {
  let app: NestFastifyApplication

  let authFilePath: string
  let secretsFilePath: string
  let authorization: string
  let tempBackupPath: string
  let instanceBackupPath: string
  let customInstanceBackupPath: string
  let largeFilePath: string

  let configService: ConfigService
  let backupService: BackupService
  let backupGateway: BackupGateway
  let pluginsService: PluginsService
  let schedulerService: SchedulerService
  let postBackupRestoreRestartFn: Mock

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')
    process.env.UIX_CUSTOM_PLUGIN_PATH = resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')
    tempBackupPath = resolve(process.env.UIX_STORAGE_PATH, 'backup.tar.gz')
    instanceBackupPath = resolve(process.env.UIX_STORAGE_PATH, 'backups/instance-backups')
    customInstanceBackupPath = resolve(process.env.UIX_STORAGE_PATH, 'backups/instance-backups-custom')
    largeFilePath = resolve(process.env.UIX_STORAGE_PATH, 'largefile/largefile.txt')

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    emptyDirSync(resolve(process.env.UIX_STORAGE_PATH, 'largefile'))

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [BackupModule, AuthModule],
    }).compile()

    const fAdapter = new FastifyAdapter()

    fAdapter.register(fastifyMultipart, {
      limits: {
        files: 1,
        fileSize: globalThis.backup.maxBackupSize,
      },
    })

    app = moduleFixture.createNestApplication<NestFastifyApplication>(fAdapter)

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    backupService = app.get(BackupService)
    backupGateway = app.get(BackupGateway)
    pluginsService = app.get(PluginsService)
    configService = app.get(ConfigService)
    schedulerService = app.get(SchedulerService)

    // Isolate plugin discovery to the test plugin path only
    ;(pluginsService as any)._paths = [resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules')]
  })

  beforeEach(async () => {
    // Mock functions
    postBackupRestoreRestartFn = vi.fn()
    backupService.postBackupRestoreRestart = postBackupRestoreRestartFn as any

    // Restore default settings
    delete configService.ui.scheduledBackupPath
    delete configService.ui.scheduledBackupDisable
    configService.instanceBackupPath = instanceBackupPath

    // Get auth token before each test
    authorization = `bearer ${(await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token}`
  })

  it('should schedule a job to backup instance', async () => {
    expect(schedulerService.scheduledJobs).toHaveProperty('instance-backup')
  })

  it('should not schedule a job to backup instance if scheduled backups are disabled', async () => {
    // Disable scheduled backups
    configService.ui.scheduledBackupDisable = true

    // Remove the job create on app creation
    schedulerService.cancelJob('instance-backup')

    // Sanity check
    expect(schedulerService.scheduledJobs).not.toHaveProperty('instance-backup')

    // Run the scheduler creation function
    backupService.scheduleInstanceBackups()

    // Still should not have a job
    expect(schedulerService.scheduledJobs).not.toHaveProperty('instance-backup')
  })

  it('should remove scheduled instance backups older than 7 days', async () => {
    // Empty the instance backup path
    await remove(configService.instanceBackupPath)
    await ensureDir(configService.instanceBackupPath)

    // create some fake backups
    const backupDates = [
      dayjs().subtract(10, 'day').toDate(),
      dayjs().subtract(9, 'day').toDate(),
      dayjs().subtract(8, 'day').toDate(),
      dayjs().subtract(7, 'day').toDate(),
      dayjs().subtract(6, 'day').toDate(),
      dayjs().subtract(5, 'day').toDate(),
      dayjs().subtract(4, 'day').toDate(),
      dayjs().subtract(3, 'day').toDate(),
      dayjs().subtract(2, 'day').toDate(),
      dayjs().subtract(1, 'day').toDate(),
    ]

    const instanceId = configService.homebridgeConfig.bridge.username.replace(RE_COLON, '')

    for (const fakeBackupDate of backupDates) {
      const backupFileName = `homebridge-backup-${instanceId}.${fakeBackupDate.getTime().toString()}.tar.gz`
      await writeFile(resolve(configService.instanceBackupPath, backupFileName), 'xyz')
    }

    // Do a sanity check beforehand
    const backupsBeforeCleanup = await readdir(configService.instanceBackupPath)
    expect(backupsBeforeCleanup).toHaveLength(10)

    // Run backup job
    await backupService.runScheduledBackupJob()

    // There should only be 7 backups on disk
    const backupsAfterJob = await readdir(configService.instanceBackupPath)
    expect(backupsAfterJob).toHaveLength(7)
  })

  it('saves scheduled backups to the custom path if set and exists', async () => {
    // cleanup
    await remove(customInstanceBackupPath)

    configService.ui.scheduledBackupPath = customInstanceBackupPath
    configService.instanceBackupPath = customInstanceBackupPath

    // Ensure the directory exists, custom backup paths are not automatically created
    await ensureDir(customInstanceBackupPath)

    // Run backup job
    await backupService.runScheduledBackupJob()

    const backups = await readdir(customInstanceBackupPath)

    expect(backups).toHaveLength(1)
  })

  it('throws an error if the custom scheduled backup path does not exist', async () => {
    // cleanup
    await remove(customInstanceBackupPath)

    configService.ui.scheduledBackupPath = customInstanceBackupPath
    configService.instanceBackupPath = customInstanceBackupPath

    await expect(backupService.ensureScheduledBackupPath()).rejects.toThrow('Custom instance backup path does not exist')
  })

  it('creates the non-custom scheduled backup path if it does not exist', async () => {
    // cleanup
    await remove(instanceBackupPath)

    await backupService.ensureScheduledBackupPath()

    expect(await pathExists(instanceBackupPath)).toBe(true)
  })

  it('GET /backup/download', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/backup/download',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/octet-stream')
  })

  it('POST /backup/restore small backup', async () => {
    // Get a new backup
    const downloadBackup = await app.inject({
      method: 'GET',
      path: '/backup/download',
      headers: {
        authorization,
      },
    })

    // Save the backup to disk
    await writeFile(tempBackupPath, downloadBackup.rawPayload)

    // create multipart form
    const payload = new FormData()
    payload.append('backup.tar.gz', await readFile(tempBackupPath))

    const headers = payload.getHeaders()
    headers.authorization = authorization

    const res = await app.inject({
      method: 'POST',
      path: '/backup/restore',
      headers,
      payload,
    })

    expect(res.statusCode).toBe(201)

    await new Promise(r => setTimeout(r, 100))

    // check the backup contains the required files
    const restoreDirectory = (backupService as any).restoreDirectory
    const pluginsJson = join(restoreDirectory, 'plugins.json')
    const infoJson = join(restoreDirectory, 'info.json')

    expect(await pathExists(pluginsJson)).toBe(true)
    expect(await pathExists(infoJson)).toBe(true)

    // Mark the "homebridge-mock-plugin" dummy plugin as public, so we can test the mock install
    const installedPlugins = (await readJson(pluginsJson)).map((x) => {
      x.publicPackage = true
      return x
    })
    await writeJson(pluginsJson, installedPlugins)

    // create some mocks
    const client = new EventEmitter()

    vi.spyOn(client, 'emit')

    vi.spyOn(pluginsService, 'managePlugin')
      .mockImplementation(async () => {
        return true
      })

    // Start restore
    await backupGateway.doRestore(client)

    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Restoring backup'))
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Restore Complete'))
    expect(pluginsService.managePlugin).toHaveBeenCalledWith('install', expect.objectContaining({ name: 'homebridge-mock-plugin', version: expect.anything() }), client)

    // Ensure the temp restore directory was removed
    expect(await pathExists(restoreDirectory)).toBe(false)
  })

  // https://github.com/homebridge/homebridge-config-ui-x/issues/1856

  it('POST /backup/restore of a large .homebridge directory should backup, but restore will not work', { timeout: 10_000 }, async () => {
    // Create a large file to be included within the backup
    emptyDirSync(resolve(process.env.UIX_STORAGE_PATH, 'largefile'))

    const createEmptyFileOfSize = (fileName, size) => {
      return new Promise((done) => {
        const fh = openSync(fileName, 'w')
        for (let i = 0; i < size; i = i + 1024) {
          writeSync(fh, randomValueHex(1024))
        }
        closeSync(fh)
        done(true)
      })
    }

    for (let i = 0; i < 10; i += 1) {
      await createEmptyFileOfSize(largeFilePath + i, 9000000)
    }

    // Get a new backup
    const downloadBackup = await app.inject({
      method: 'GET',
      path: '/backup/download',
      headers: {
        authorization,
      },
    })

    // Save the backup to disk
    await writeFile(tempBackupPath, downloadBackup.rawPayload)

    expect(globalThis.console.error).toHaveBeenCalledWith(expect.stringContaining('Homebridge UI'), expect.stringContaining('Backup file exceeds maximum restore file size'))

    // create multipart form
    const payload = new FormData()
    payload.append('backup.tar.gz', await readFile(tempBackupPath))

    const headers = payload.getHeaders()
    headers.authorization = authorization

    const res = await app.inject({
      method: 'POST',
      path: '/backup/restore',
      headers,
      payload,
    })

    expect(globalThis.console.error).toHaveBeenCalledWith(expect.stringContaining('Homebridge UI'), expect.stringContaining('Restore backup failed as Restore file exceeds maximum size'))

    expect(res.statusCode).toBe(500)

    await new Promise(r => setTimeout(r, 100))

    // check the backup contains the required files
    const restoreDirectory = (backupService as any).restoreDirectory

    // Ensure the temp restore directory was removed
    expect(await pathExists(restoreDirectory)).toBe(false)
  })

  it('GET /backup/restart', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/backup/restart',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(postBackupRestoreRestartFn).toHaveBeenCalled()
  })

  it('GET /backup/scheduled-backups (path missing)', async () => {
    // Empty the instance backup path
    await remove(configService.instanceBackupPath)

    const res = await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(0)

    // The path should have been re-created
    expect(await pathExists(configService.instanceBackupPath)).toBe(true)
  })

  it('GET /backup/scheduled-backups', async () => {
    // Empty the instance backup path
    await emptyDir(configService.instanceBackupPath)

    // Run the scheduled backup job
    await backupService.runScheduledBackupJob()

    const res = await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0]).toHaveProperty('id')
    expect(res.json()[0]).toHaveProperty('fileName')
    expect(res.json()[0]).toHaveProperty('timestamp')
  })

  it('GET /backup/scheduled-backups (sorted newest first by id)', async () => {
    await emptyDir(configService.instanceBackupPath)
    const instanceId = configService.homebridgeConfig.bridge.username.replace(RE_COLON, '')

    const timestamps = [1500000000000, 1700000000000, 1600000000000]
    for (const ts of timestamps) {
      await writeFile(
        resolve(configService.instanceBackupPath, `homebridge-backup-${instanceId}.${ts}.tar.gz`),
        'xyz',
      )
    }

    const res = await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups',
      headers: { authorization },
    })

    expect(res.statusCode).toBe(200)
    const ids = res.json().map((b: any) => b.id)
    expect(ids).toEqual([
      `${instanceId}.1700000000000`,
      `${instanceId}.1600000000000`,
      `${instanceId}.1500000000000`,
    ])
  })

  it('GET /backup/scheduled-backups/:backupId', async () => {
    const scheduledBackups = (await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups',
      headers: {
        authorization,
      },
    })).json()

    const res = await app.inject({
      method: 'GET',
      path: `/backup/scheduled-backups/${scheduledBackups[0].id}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/octet-stream')
  })

  it('GET /backup/scheduled-backups/:backupId (invalid format)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups/xxxxxxxxxxxx',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).not.toBe('application/octet-stream')
  })

  it('GET /backup/scheduled-backups/:backupId (not found)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups/0ACAC1AC01AC.1765432100000',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).not.toBe('application/octet-stream')
  })

  it('GET /backup/scheduled-backups/next', async () => {
    // Run the scheduler creation function (to make sure it's enabled after previous tests)
    backupService.scheduleInstanceBackups()

    const res = await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups/next',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('next')
    expect(res.json().next).not.toBe(false)
    expect(dayjs(res.json().next).isValid()).toBe(true)
  })

  it('GET /backup/scheduled-backups/next (backups disabled)', async () => {
    // Disable scheduled backups
    configService.ui.scheduledBackupDisable = true

    const res = await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups/next',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('next')
    expect(res.json().next).toBe(false)
  })

  it('DELETE /backup/scheduled-backups/:backupId', async () => {
    // Ensure we have a backup
    await emptyDir(configService.instanceBackupPath)
    await backupService.runScheduledBackupJob()

    // List to get the ID
    const listRes = (await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups',
      headers: { authorization },
    })).json()

    expect(listRes).toHaveLength(1)
    const backupId = listRes[0].id

    // Delete it
    const res = await app.inject({
      method: 'DELETE',
      path: `/backup/scheduled-backups/${backupId}`,
      headers: { authorization },
    })

    expect(res.statusCode).toBe(200)

    // Verify it's gone
    const listRes2 = (await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups',
      headers: { authorization },
    })).json()

    expect(listRes2).toHaveLength(0)
  })

  it('DELETE /backup/scheduled-backups/:backupId (not found)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      path: '/backup/scheduled-backups/0ACAC1AC01AC.1765432100000',
      headers: { authorization },
    })

    expect(res.statusCode).toBe(404)
  })

  it('DELETE /backup/scheduled-backups/:backupId (invalid format)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      path: '/backup/scheduled-backups/xxxxxxxxxxxx',
      headers: { authorization },
    })

    expect(res.statusCode).toBe(400)
  })

  it('POST /backup/scheduled-backups/:backupId/restore', async () => {
    // Create a backup to restore from
    await emptyDir(configService.instanceBackupPath)
    await backupService.runScheduledBackupJob()

    const listRes = (await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups',
      headers: { authorization },
    })).json()

    const backupId = listRes[0].id

    // Extract it to restore directory
    const res = await app.inject({
      method: 'POST',
      path: `/backup/scheduled-backups/${backupId}/restore`,
      headers: { authorization },
    })

    expect(res.statusCode).toBe(201)
  })

  it('POST /backup/scheduled-backups/:backupId/restore (not found)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/backup/scheduled-backups/0ACAC1AC01AC.1765432100000/restore',
      headers: { authorization },
    })

    expect(res.statusCode).toBe(404)
  })

  it('POST /backup/scheduled-backups/:backupId/restore (invalid format)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/backup/scheduled-backups/xxxxxxxxxxxx/restore',
      headers: { authorization },
    })

    expect(res.statusCode).toBe(400)
  })

  it('PUT /backup/restore/trigger (after scheduled restore extract)', async () => {
    // The previous test extracted a backup to the restore directory
    // Mock postBackupRestoreRestart to prevent actual process kill
    postBackupRestoreRestartFn.mockReturnValue({ status: 0 })

    const res = await app.inject({
      method: 'PUT',
      path: '/backup/restore/trigger',
      headers: { authorization },
    })

    expect(res.statusCode).toBe(200)
  })

  describe('BackupGateway', () => {
    let gwClient: EventEmitter

    beforeEach(() => {
      gwClient = new EventEmitter()
      vi.spyOn(gwClient, 'emit')
    })

    it('do-restore should delegate to backupService.restoreFromBackup', async () => {
      vi.spyOn(backupService, 'restoreFromBackup').mockResolvedValue({ status: 0 })

      const result = await backupGateway.doRestore(gwClient)

      expect(backupService.restoreFromBackup).toHaveBeenCalledWith(gwClient)
      expect(result).toEqual({ status: 0 })
    })

    it('do-restore should emit error on failure', async () => {
      vi.spyOn(backupService, 'restoreFromBackup').mockRejectedValue(new Error('restore failed'))

      const result = await backupGateway.doRestore(gwClient)

      expect(gwClient.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('restore failed'))
      expect(result).toBeDefined()
    })

    it('do-restore-hbfx should delegate to backupService.restoreHbfxBackup', async () => {
      vi.spyOn(backupService, 'restoreHbfxBackup').mockResolvedValue({ status: 0 })

      const result = await backupGateway.doRestoreHbfx(gwClient)

      expect(backupService.restoreHbfxBackup).toHaveBeenCalledWith(gwClient)
      expect(result).toEqual({ status: 0 })
    })

    it('do-restore-hbfx should emit error on failure', async () => {
      vi.spyOn(backupService, 'restoreHbfxBackup').mockRejectedValue(new Error('hbfx restore failed'))

      const result = await backupGateway.doRestoreHbfx(gwClient)

      expect(gwClient.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('hbfx restore failed'))
      expect(result).toBeDefined()
    })

    it('do-restore should return WsException on error', async () => {
      const error = new Error('unexpected error')
      vi.spyOn(backupService, 'restoreFromBackup').mockRejectedValue(error)

      const result = await backupGateway.doRestore(gwClient)

      // The gateway should catch, log, emit red error, and return WsException
      expect(gwClient.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('unexpected error'))
      expect((result as any).error).toBeDefined()
    })
  })

  describe('Concurrent restore safety', () => {
    it('restoreScheduledBackup refuses to interleave with an in-progress restore', async () => {
      const stagingDir = await mkdtemp(join(tmpdir(), 'audit-concurrent-'))
      await writeFileAsync(join(stagingDir, 'info.json'), JSON.stringify({ name: 'audit' }))

      const backupId = 'abcdef012345.987654321'
      const backupFile = `homebridge-backup-${backupId}.tar.gz`
      await tarCreate(
        { gzip: true, cwd: stagingDir, file: resolve(configService.instanceBackupPath, backupFile) },
        ['info.json'],
      )

      // Simulate an in-flight restore that has already reserved the slot.
      ;(backupService as any).restoreDirectory = '/tmp/already-restoring'

      await expect(backupService.restoreScheduledBackup(backupId)).rejects.toThrow(/another restore/i)

      // Clean up the simulated slot so other tests aren't affected.
      ;(backupService as any).restoreDirectory = undefined
      await remove(stagingDir)
    })
  })

  describe('Archive entry safety', () => {
    it('restoreScheduledBackup drops symlink entries during tar extraction', async () => {
      const stagingDir = await mkdtemp(join(tmpdir(), 'audit-staging-'))
      await writeFileAsync(join(stagingDir, 'info.json'), JSON.stringify({ name: 'audit' }))
      await symlink('/tmp/audit-symlink-target', join(stagingDir, 'evil'))

      const backupId = '0123456789ab.123456789'
      const backupFile = `homebridge-backup-${backupId}.tar.gz`
      await tarCreate(
        { gzip: true, cwd: stagingDir, file: resolve(configService.instanceBackupPath, backupFile) },
        ['info.json', 'evil'],
      )

      await backupService.restoreScheduledBackup(backupId)

      const restoreDir = (backupService as any).restoreDirectory as string
      expect(restoreDir).toBeDefined()
      const entries = await readdir(restoreDir)
      for (const entry of entries) {
        const stats = await lstat(join(restoreDir, entry))
        expect(stats.isSymbolicLink()).toBe(false)
      }

      await remove(stagingDir)
      await remove(restoreDir)
    })

    it('uploadBackupRestore drops symlink entries from a crafted tarball', async () => {
      // Clear the singleton slot in case a prior test in this describe
      // block left it occupied — concurrent-upload rejection would
      // otherwise mask the actual extraction behaviour we want to test.
      ;(backupService as any).restoreDirectory = undefined

      const stagingDir = await mkdtemp(join(tmpdir(), 'audit-upload-'))
      await writeFileAsync(join(stagingDir, 'info.json'), JSON.stringify({ name: 'audit' }))
      await symlink('/tmp/audit-upload-target', join(stagingDir, 'evil-link'))

      const tarPath = join(stagingDir, 'crafted.tar.gz')
      await tarCreate(
        { gzip: true, cwd: stagingDir, file: tarPath },
        ['info.json', 'evil-link'],
      )

      const payload = new FormData()
      payload.append('crafted.tar.gz', await readFile(tarPath))
      const headers = payload.getHeaders()
      headers.authorization = authorization

      const res = await app.inject({
        method: 'POST',
        path: '/backup/restore',
        headers,
        payload,
      })
      expect(res.statusCode).toBe(201)

      await new Promise(r => setTimeout(r, 100))
      const restoreDir = (backupService as any).restoreDirectory as string
      expect(restoreDir).toBeDefined()
      const entries = await readdir(restoreDir)
      for (const entry of entries) {
        const stats = await lstat(join(restoreDir, entry))
        expect(stats.isSymbolicLink()).toBe(false)
      }

      await remove(stagingDir)
      await remove(restoreDir).catch(() => undefined)
      ;(backupService as any).restoreDirectory = undefined
    })

    it('extractZipSafely rejects an entry whose resolved path escapes the destination', async () => {
      // Hand-built minimal zip with one safe entry + one path-traversal
      // entry. yazl/archiver aren't in the tree, so we assemble the
      // bytes manually rather than pull in a devDep just for one test.
      const { Readable } = await import('node:stream')
      const buildZip = (entries: { name: string, data: Buffer }[]): Buffer => {
        const localParts: Buffer[] = []
        const centralParts: Buffer[] = []
        let offset = 0
        for (const entry of entries) {
          const nameBuf = Buffer.from(entry.name, 'utf8')
          const local = Buffer.alloc(30)
          local.writeUInt32LE(0x04034B50, 0) // local file header signature
          local.writeUInt16LE(20, 4) // version
          local.writeUInt16LE(0, 6) // flags
          local.writeUInt16LE(0, 8) // method = store
          local.writeUInt16LE(0, 10) // time
          local.writeUInt16LE(0, 12) // date
          const crc = crypto.createHash('sha1').update(entry.data).digest() // placeholder; real CRC32 not strictly required for our reader to enumerate
          local.writeUInt32LE(0, 14) // crc32 (zeroed — unzipper tolerates)
          local.writeUInt32LE(entry.data.length, 18)
          local.writeUInt32LE(entry.data.length, 22)
          local.writeUInt16LE(nameBuf.length, 26)
          local.writeUInt16LE(0, 28)
          localParts.push(local, nameBuf, entry.data)
          const central = Buffer.alloc(46)
          central.writeUInt32LE(0x02014B50, 0)
          central.writeUInt16LE(20, 4)
          central.writeUInt16LE(20, 6)
          central.writeUInt16LE(0, 8)
          central.writeUInt16LE(0, 10)
          central.writeUInt16LE(0, 12)
          central.writeUInt16LE(0, 14)
          central.writeUInt32LE(0, 16) // crc32
          central.writeUInt32LE(entry.data.length, 20)
          central.writeUInt32LE(entry.data.length, 24)
          central.writeUInt16LE(nameBuf.length, 28)
          central.writeUInt16LE(0, 30)
          central.writeUInt16LE(0, 32)
          central.writeUInt16LE(0, 34)
          central.writeUInt16LE(0, 36)
          central.writeUInt32LE(0, 38) // external attrs
          central.writeUInt32LE(offset, 42) // local header offset
          centralParts.push(central, nameBuf)
          offset += local.length + nameBuf.length + entry.data.length
          // Suppress unused-var warning from the CRC placeholder helper.
          void crc
        }
        const centralSize = centralParts.reduce((acc, b) => acc + b.length, 0)
        const eocd = Buffer.alloc(22)
        eocd.writeUInt32LE(0x06054B50, 0)
        eocd.writeUInt16LE(0, 4)
        eocd.writeUInt16LE(0, 6)
        eocd.writeUInt16LE(entries.length, 8)
        eocd.writeUInt16LE(entries.length, 10)
        eocd.writeUInt32LE(centralSize, 12)
        eocd.writeUInt32LE(offset, 16)
        eocd.writeUInt16LE(0, 20)
        return Buffer.concat([...localParts, ...centralParts, eocd])
      }

      const destDir = await mkdtemp(join(tmpdir(), 'audit-zip-'))
      const escapeTarget = resolve(destDir, '..', 'audit-zip-escape.txt')
      try {
        const zipBuffer = buildZip([
          { name: 'storage/legit.txt', data: Buffer.from('ok\n') },
          { name: '../audit-zip-escape.txt', data: Buffer.from('OWNED\n') },
        ])
        const source = Readable.from(zipBuffer)
        await expect((backupService as any).extractZipSafely(source, destDir))
          .rejects
          .toThrow(/escapes destination/i)
        expect(await pathExists(escapeTarget)).toBe(false)
      } finally {
        await remove(destDir).catch(() => undefined)
        await remove(escapeTarget).catch(() => undefined)
      }
    })
  })

  afterAll(async () => {
    schedulerService.scheduledJobs['instance-backup']?.cancel()
    await app.close()
  })
})
