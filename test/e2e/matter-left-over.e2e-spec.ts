import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { resolve } from 'node:path'
import process from 'node:process'

import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, ensureDir, pathExists, readJson, remove, writeFile, writeJson } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { HomebridgeIpcService } from '../../src/core/homebridge-ipc/homebridge-ipc.service.js'
import { ServerModule } from '../../src/modules/server/server.module.js'

import '../../src/global-defaults.js'

/**
 * Homebridge keeps one folder of Matter storage for each bridge and each external accessory (`matter/<id>/`), and
 * never deletes one. A folder that nothing uses any more is listed as one that could be left over, so it can be
 * seen and removed (homebridge#4026).
 */
describe('left-over matter storage (e2e)', () => {
  let app: NestFastifyApplication
  let authorization: string
  let storagePath: string
  let matterPath: string

  /** The bridge of the mock config.json */
  const MAIN_BRIDGE = '67:E4:1F:0E:A0:5D'

  /** A plugin that is installed (test/mocks/plugins) and one that is not */
  const INSTALLED = 'homebridge-mock-plugin'
  const NOT_INSTALLED = 'homebridge-gone-plugin'

  const VACUUM = {
    uuid: 'vacuum-uuid',
    displayName: 'Robot Vacuum',
    manufacturer: 'Robo',
    model: 'V1',
    serialNumber: 'RV-1',
  }

  /**
   * Make the storage folder of one Matter node.
   * @param id - the folder name, 12 hex digits
   * @param files - what to put in it
   * @param files.accessories - the cached accessories (no file when left out)
   * @param files.owner - the owner file Homebridge writes for an external accessory
   * @param files.commissioned - whether a controller is paired
   * @param files.lockedBy - the process id in a storage lock, as Homebridge holds while the node runs
   */
  async function matterFolder(id: string, files: { accessories?: object[], owner?: object, commissioned?: boolean, lockedBy?: number } = {}) {
    const folder = resolve(matterPath, id)
    await ensureDir(folder)
    if (files.accessories) {
      await writeJson(resolve(folder, 'accessories.json'), files.accessories)
    }
    if (files.owner) {
      await writeJson(resolve(folder, 'homebridge-owner.json'), files.owner)
    }
    if (files.commissioned !== undefined) {
      await writeJson(resolve(folder, 'commissioning.json'), { commissioned: files.commissioned, qrCode: 'MT:TEST', manualPairingCode: '1234-567-8901' })
    }
    if (files.lockedBy !== undefined) {
      // matter.js locks the node's own folder, one level down
      await ensureDir(resolve(folder, id))
      await writeFile(resolve(folder, id, 'matter.lock'), '')
      await writeFile(resolve(folder, id, 'matter.pid'), `${files.lockedBy}\n`)
    }
    return folder
  }

  /** Save a config.json with these extra platform blocks next to the UI's own */
  async function configWith(...platforms: object[]) {
    const config = await readJson(resolve(__dirname, '../mocks', 'config.json'))
    config.platforms.push(...platforms)
    await writeJson(process.env.UIX_CONFIG_PATH, config)
  }

  async function pairings(): Promise<any[]> {
    const res = await app.inject({
      method: 'GET',
      path: '/server/pairings',
      headers: { authorization },
    })
    expect(res.statusCode).toBe(200)
    return res.json()
  }

  async function pairing(id: string) {
    return (await pairings()).find(device => device._id === id)
  }

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')
    process.env.UIX_CUSTOM_PLUGIN_PATH = resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules')

    storagePath = process.env.UIX_STORAGE_PATH
    matterPath = resolve(storagePath, 'matter')

    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)
    await copy(resolve(__dirname, '../mocks', 'auth.json'), resolve(storagePath, 'auth.json'))
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), resolve(storagePath, '.uix-secrets'))

    await remove(process.env.UIX_CUSTOM_PLUGIN_PATH)
    await copy(resolve(__dirname, '../mocks', 'plugins'), process.env.UIX_CUSTOM_PLUGIN_PATH)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ServerModule, AuthModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  beforeEach(async () => {
    authorization = `bearer ${(await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: { username: 'admin', password: 'admin' },
    })).json().access_token}`

    await remove(matterPath)
    await remove(resolve(storagePath, 'persist'))
    await remove(resolve(storagePath, 'accessories'))
    await copy(resolve(__dirname, '../mocks', 'persist'), resolve(storagePath, 'persist'))
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)
  })

  afterAll(async () => {
    await remove(matterPath)
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)
    await app.close()
  })

  describe('an external accessory, such as a robot vacuum', () => {
    it('could be left over when its plugin is no longer installed', async () => {
      await matterFolder('AABBCCDDEE01', {
        accessories: [
          { ...VACUUM, plugin: NOT_INSTALLED },
        ],
        commissioned: true,
      })

      const device = await pairing('AABBCCDDEE01')

      expect(device).toMatchObject({
        name: 'Robot Vacuum',
        _matterOnly: true,
        _isPaired: true,
        _plugin: NOT_INSTALLED,
        _couldBeStale: true,
      })
    })

    it('is in use when its plugin is installed and nothing says otherwise', async () => {
      await matterFolder('AABBCCDDEE02', {
        accessories: [
          { ...VACUUM, plugin: INSTALLED },
        ],
      })

      expect((await pairing('AABBCCDDEE02'))._couldBeStale).toBe(false)
    })

    it('could be left over when config.json no longer has the platform that published it', async () => {
      await matterFolder('AABBCCDDEE03', {
        accessories: [
          { ...VACUUM, plugin: INSTALLED, platform: 'MockVacuums' },
        ],
      })

      expect((await pairing('AABBCCDDEE03'))._couldBeStale).toBe(true)
    })

    it('is in use when config.json has the platform that published it', async () => {
      await configWith({ platform: 'MockVacuums', name: 'Vacuums' })
      await matterFolder('AABBCCDDEE04', {
        accessories: [
          { ...VACUUM, plugin: INSTALLED, platform: 'MockVacuums' },
        ],
      })

      expect((await pairing('AABBCCDDEE04'))._couldBeStale).toBe(false)
    })

    // Homebridge saves this name when a plugin publishes an accessory without naming its platform
    it('is not judged by the placeholder platform name Homebridge saves', async () => {
      await matterFolder('AABBCCDDEE05', {
        accessories: [
          { ...VACUUM, plugin: INSTALLED, platform: 'ExternalMatter' },
        ],
      })

      expect((await pairing('AABBCCDDEE05'))._couldBeStale).toBe(false)
    })

    it('could be left over when the bridge that owns it is no longer in config.json', async () => {
      await matterFolder('AABBCCDDEE06', {
        accessories: [
          { ...VACUUM, plugin: INSTALLED },
        ],
        owner: {
          bridge: '0E:AA:AA:AA:AA:AA',
          uuid: VACUUM.uuid,
          plugin: INSTALLED,
          platform: 'ExternalMatter',
        },
      })

      expect((await pairing('AABBCCDDEE06'))._couldBeStale).toBe(true)
    })

    it.each([
      ['the main bridge', MAIN_BRIDGE],
      ['a child bridge in config.json', '0E:BB:BB:BB:BB:BB'],
    ])('is in use when %s owns it', async (_case, bridge) => {
      await configWith({
        platform: 'MockVacuums',
        _bridge: { username: '0E:BB:BB:BB:BB:BB', port: 51900 },
      })
      await matterFolder('AABBCCDDEE07', {
        accessories: [
          { ...VACUUM, plugin: INSTALLED },
        ],
        owner: {
          bridge,
          uuid: VACUUM.uuid,
          plugin: INSTALLED,
          platform: 'ExternalMatter',
        },
      })

      expect((await pairing('AABBCCDDEE07'))._couldBeStale).toBe(false)
    })

    it('is in use while Homebridge holds the lock on its storage, whatever else the files say', async () => {
      await matterFolder('AABBCCDDEE08', {
        accessories: [
          { ...VACUUM, plugin: NOT_INSTALLED },
        ],
        lockedBy: process.pid,
      })

      expect((await pairing('AABBCCDDEE08'))._couldBeStale).toBe(false)
    })

    it('is not kept by a lock whose process is gone, as a killed Homebridge leaves behind', async () => {
      // Above the largest process id of Linux and macOS, so no process has it
      await matterFolder('AABBCCDDEE09', {
        accessories: [
          { ...VACUUM, plugin: NOT_INSTALLED },
        ],
        lockedBy: 2 ** 30,
      })

      expect((await pairing('AABBCCDDEE09'))._couldBeStale).toBe(true)
    })
  })

  describe('a folder with no cached accessories', () => {
    it('is listed as one that could be left over, where it used to be hidden', async () => {
      await matterFolder('AABBCCDDEE10', { commissioned: true })

      const device = await pairing('AABBCCDDEE10')

      expect(device).toMatchObject({
        _username: 'AA:BB:CC:DD:EE:10',
        _matter: true,
        _matterOnly: true,
        _isPaired: true,
        _couldBeStale: true,
      })
      expect(device.name).toBeTruthy()
    })

    it('is listed when its list of cached accessories is empty, as removing the last one in the ui leaves it', async () => {
      await matterFolder('AABBCCDDEE11', { accessories: [], commissioned: false })

      expect(await pairing('AABBCCDDEE11')).toMatchObject({ _isPaired: false, _couldBeStale: true })
    })

    it('names the plugin that owned it, when Homebridge wrote that down', async () => {
      await matterFolder('AABBCCDDEE12', {
        owner: {
          bridge: '0E:AA:AA:AA:AA:AA',
          uuid: 'x',
          plugin: NOT_INSTALLED,
          platform: 'ExternalMatter',
        },
      })

      expect(await pairing('AABBCCDDEE12')).toMatchObject({ _plugin: NOT_INSTALLED, _couldBeStale: true })
    })

    it('stays hidden when it is the storage of a child bridge in config.json', async () => {
      await configWith({
        platform: 'MockVacuums',
        _bridge: {
          username: 'AA:BB:CC:DD:EE:13',
          port: 51900,
          matter: { port: 5540 },
        },
      })
      await matterFolder('AABBCCDDEE13', { commissioned: true })

      expect(await pairing('AABBCCDDEE13')).toBeUndefined()
    })

    it('stays hidden while Homebridge holds the lock on it', async () => {
      await matterFolder('AABBCCDDEE14', { lockedBy: process.pid })

      expect(await pairing('AABBCCDDEE14')).toBeUndefined()
    })

    it('stays hidden when its owner is still installed and in config.json, as its accessory comes back at the next start', async () => {
      await matterFolder('AABBCCDDEE15', {
        accessories: [],
        owner: {
          bridge: MAIN_BRIDGE,
          uuid: 'x',
          plugin: INSTALLED,
          platform: 'ExternalMatter',
        },
      })

      expect(await pairing('AABBCCDDEE15')).toBeUndefined()
    })

    it('never lists the storage of the main bridge', async () => {
      await matterFolder('67E41F0EA05D', { commissioned: true })

      expect((await pairings()).filter(device => device._id === '67E41F0EA05D' && device._matterOnly)).toEqual([])
    })
  })

  describe('a child bridge with both HomeKit and Matter', () => {
    const STALE = {
      displayName: 'Old Bridge',
      category: 2,
      pincode: '111-22-333',
      signSk: 'a'.repeat(128),
      signPk: 'a'.repeat(64),
      pairedClients: {},
    }

    it('shows that a left-over bridge also has matter storage', async () => {
      await writeJson(resolve(storagePath, 'persist', 'AccessoryInfo.0ECCCCCCCCCC.json'), STALE)
      await matterFolder('0ECCCCCCCCCC', { commissioned: true })

      expect(await pairing('0ECCCCCCCCCC')).toMatchObject({ _couldBeStale: true, _matter: true })
    })

    it('shows no matter for a left-over bridge without matter storage', async () => {
      await writeJson(resolve(storagePath, 'persist', 'AccessoryInfo.0EDDDDDDDDDD.json'), STALE)

      expect(await pairing('0EDDDDDDDDDD')).toMatchObject({ _couldBeStale: true, _matter: false })
    })
  })

  it('removes the whole folder of a left-over node, pairing included', async () => {
    vi.spyOn(app.get(HomebridgeIpcService), 'restartAndWaitForClose').mockResolvedValue(undefined)
    const folder = await matterFolder('AABBCCDDEE16', { commissioned: true })

    const res = await app.inject({
      method: 'DELETE',
      path: '/server/pairings/AABBCCDDEE16',
      headers: { authorization },
    })

    expect(res.statusCode).toBe(204)
    expect(await pathExists(folder)).toBe(false)
  })
})
