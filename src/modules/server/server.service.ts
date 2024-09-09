import { exec, spawn } from 'node:child_process'

import { join, resolve } from 'node:path'
import process from 'node:process'
import { Categories } from '@homebridge/hap-client/dist/hap-types'

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { alloc } from 'buffer-shims'
import {
  pathExists,
  readdir,
  readJson,
  remove,
  unlink,
  writeJson,
} from 'fs-extra'
import NodeCache from 'node-cache'
import { networkInterfaces } from 'systeminformation'
import { check as tcpCheck } from 'tcp-port-used'
import type { Systeminformation } from 'systeminformation'

import { ConfigService, HomebridgeConfig } from '../../core/config/config.service'
import { HomebridgeIpcService } from '../../core/homebridge-ipc/homebridge-ipc.service'
import { Logger } from '../../core/logger/logger.service'
import { AccessoriesService } from '../accessories/accessories.service'
import { ConfigEditorService } from '../config-editor/config-editor.service'
import { HomebridgeMdnsSettingDto } from './server.dto'

@Injectable()
export class ServerService {
  private serverServiceCache = new NodeCache({ stdTTL: 300 })

  private readonly accessoryId: string
  private readonly accessoryInfoPath: string

  public setupCode: string | null = null

  constructor(
    private readonly configService: ConfigService,
    private readonly configEditorService: ConfigEditorService,
    private readonly accessoriesService: AccessoriesService,
    private readonly homebridgeIpcService: HomebridgeIpcService,
    private readonly logger: Logger,
  ) {
    this.accessoryId = this.configService.homebridgeConfig.bridge.username.split(':').join('')
    this.accessoryInfoPath = join(this.configService.storagePath, 'persist', `AccessoryInfo.${this.accessoryId}.json`)
  }

  /**
   * Restart the server
   */
  public async restartServer() {
    this.logger.log('Homebridge restart request received')

    if (this.configService.serviceMode && !(await this.configService.uiRestartRequired() || await this.nodeVersionChanged())) {
      this.logger.log('UI / Bridge settings have not changed; only restarting Homebridge process')
      // restart homebridge by killing child process
      this.homebridgeIpcService.restartHomebridge()

      // reset the pool of discovered homebridge instances
      this.accessoriesService.resetInstancePool()
      return { ok: true, command: 'SIGTERM', restartingUI: false }
    }

    setTimeout(() => {
      if (this.configService.ui.restart) {
        this.logger.log(`Executing restart command: ${this.configService.ui.restart}`)
        exec(this.configService.ui.restart, (err) => {
          if (err) {
            this.logger.log('Restart command exited with an error. Failed to restart Homebridge.')
          }
        })
      } else {
        this.logger.log('Sending SIGTERM to process...')
        process.kill(process.pid, 'SIGTERM')
      }
    }, 500)

    return { ok: true, command: this.configService.ui.restart, restartingUI: true }
  }

  /**
   * Resets homebridge accessory and deletes all accessory cache.
   * Preserves plugin config.
   */
  public async resetHomebridgeAccessory() {
    // restart ui on next restart
    this.configService.hbServiceUiRestartRequired = true

    const configFile = await this.configEditorService.getConfigFile()

    // generate new random username and pin
    configFile.bridge.pin = this.configEditorService.generatePin()
    configFile.bridge.username = this.configEditorService.generateUsername()

    this.logger.warn(`Homebridge Reset: New Username: ${configFile.bridge.username}`)
    this.logger.warn(`Homebridge Reset: New Pin: ${configFile.bridge.pin}`)

    // save the config file
    await this.configEditorService.updateConfigFile(configFile)

    // remove accessories and persist directories
    await remove(resolve(this.configService.storagePath, 'accessories'))
    await remove(resolve(this.configService.storagePath, 'persist'))

    this.logger.log('Homebridge Reset: "persist" directory removed.')
    this.logger.log('Homebridge Reset: "accessories" directory removed.')
  }

  /**
   * Return a list of the device pairings in the homebridge persist folder
   */
  public async getDevicePairings() {
    const persistPath = join(this.configService.storagePath, 'persist')

    const devices = (await readdir(persistPath))
      .filter(x => x.match(/AccessoryInfo\.([A-F,a-f0-9]+)\.json/))

    return Promise.all(devices.map(async (x) => {
      return await this.getDevicePairingById(x.split('.')[1])
    }))
  }

  /**
   * Return a single device pairing
   * @param deviceId
   */
  public async getDevicePairingById(deviceId: string) {
    const persistPath = join(this.configService.storagePath, 'persist')

    let device: any
    try {
      device = await readJson(join(persistPath, `AccessoryInfo.${deviceId}.json`))
    } catch (e) {
      throw new NotFoundException()
    }

    device._id = deviceId
    device._username = device._id.match(/.{1,2}/g).join(':')
    device._main = this.configService.homebridgeConfig.bridge.username.toUpperCase() === device._username.toUpperCase()
    device._isPaired = device.pairedClients && Object.keys(device.pairedClients).length > 0
    device._setupCode = this.generateSetupCode(device)

    // filter out some properties
    delete device.signSk
    delete device.signPk
    delete device.configHash
    delete device.pairedClients
    delete device.pairedClientsPermission

    try {
      device._category = Object.entries(Categories).find(([, value]) => value === device.category)[0].toLowerCase()
    } catch (e) {
      device._category = 'Other'
    }

    return device
  }

  /**
   * Remove a device pairing
   */
  public async deleteDevicePairing(id: string) {
    const persistPath = join(this.configService.storagePath, 'persist')
    const cachedAccessoriesDir = join(this.configService.storagePath, 'accessories')

    const accessoryInfo = join(persistPath, `AccessoryInfo.${id}.json`)
    const identifierCache = join(persistPath, `IdentifierCache.${id}.json`)
    const cachedAccessories = join(cachedAccessoriesDir, `cachedAccessories.${id}`)
    const cachedAccessoriesBackup = join(cachedAccessoriesDir, `.cachedAccessories.${id}.bak`)

    if (await pathExists(accessoryInfo)) {
      await unlink(accessoryInfo)
      this.logger.warn(`Removed ${accessoryInfo}`)
    }

    if (await pathExists(identifierCache)) {
      await unlink(identifierCache)
      this.logger.warn(`Removed ${identifierCache}`)
    }

    if (await pathExists(cachedAccessories)) {
      await unlink(cachedAccessories)
      this.logger.warn(`Removed ${cachedAccessories}`)
    }

    if (await pathExists(cachedAccessoriesBackup)) {
      await unlink(cachedAccessoriesBackup)
      this.logger.warn(`Removed ${cachedAccessoriesBackup}`)
    }
  }

  /**
   * Returns all cached accessories
   */
  public async getCachedAccessories() {
    const cachedAccessoriesDir = join(this.configService.storagePath, 'accessories')

    const cachedAccessoryFiles = (await readdir(cachedAccessoriesDir))
      .filter(x => x.match(/^cachedAccessories\.([A-F,0-9]+)$/) || x === 'cachedAccessories')

    const cachedAccessories = []

    await Promise.all(cachedAccessoryFiles.map(async (x) => {
      const accessories = await readJson(join(cachedAccessoriesDir, x))
      for (const accessory of accessories) {
        accessory.$cacheFile = x
        cachedAccessories.push(accessory)
      }
    }))

    return cachedAccessories
  }

  /**
   * Remove a single cached accessory
   */
  public async deleteCachedAccessory(uuid: string, cacheFile: string) {
    cacheFile = cacheFile || 'cachedAccessories'

    if (!this.configService.serviceMode) {
      this.logger.error('The reset accessories cache command is only available in service mode')
      throw new BadRequestException('This command is only available in service mode')
    }

    const cachedAccessoriesPath = resolve(this.configService.storagePath, 'accessories', cacheFile)

    this.logger.warn(`Shutting down Homebridge before removing cached accessory: ${uuid}`)

    // wait for homebridge to stop.
    await this.homebridgeIpcService.restartAndWaitForClose()

    const cachedAccessories = await readJson(cachedAccessoriesPath) as Array<any>
    const accessoryIndex = cachedAccessories.findIndex(x => x.UUID === uuid)

    if (accessoryIndex > -1) {
      cachedAccessories.splice(accessoryIndex, 1)
      await writeJson(cachedAccessoriesPath, cachedAccessories)
      this.logger.warn(`Removed cached accessory with UUID: ${uuid}`)
    } else {
      this.logger.error(`Cannot find cached accessory with UUID: ${uuid}`)
      throw new NotFoundException()
    }

    return { ok: true }
  }

  /**
   * Clears the Homebridge Accessory Cache
   */
  public async resetCachedAccessories() {
    if (!this.configService.serviceMode) {
      this.logger.error('The reset accessories cache command is only available in service mode')
      throw new BadRequestException('This command is only available in service mode')
    }

    const cachedAccessoriesDir = join(this.configService.storagePath, 'accessories')
    const cachedAccessoryPaths = (await readdir(cachedAccessoriesDir))
      .filter(x => x.match(/cachedAccessories\.([A-F,0-9]+)/) || x === 'cachedAccessories' || x === '.cachedAccessories.bak')
      .map(x => resolve(cachedAccessoriesDir, x))

    const cachedAccessoriesPath = resolve(this.configService.storagePath, 'accessories', 'cachedAccessories')

    // wait for homebridge to stop.
    await this.homebridgeIpcService.restartAndWaitForClose()

    this.logger.warn('Shutting down Homebridge before removing cached accessories')

    try {
      this.logger.log('Clearing Cached Homebridge Accessories...')
      for (const thisCachedAccessoriesPath of cachedAccessoryPaths) {
        if (await pathExists(thisCachedAccessoriesPath)) {
          await unlink(thisCachedAccessoriesPath)
          this.logger.warn(`Removed ${thisCachedAccessoriesPath}`)
        }
      }
    } catch (e) {
      this.logger.error(`Failed to clear Homebridge Accessories Cache at ${cachedAccessoriesPath}`)
      console.error(e)
      throw new InternalServerErrorException('Failed to clear Homebridge accessory cache - see logs.')
    }

    return { ok: true }
  }

  /**
   * Returns existing setup code if cached, or requests one
   */
  public async getSetupCode(): Promise<string | null> {
    if (this.setupCode) {
      return this.setupCode
    } else {
      if (!await pathExists(this.accessoryInfoPath)) {
        return null
      }

      const accessoryInfo = await readJson(this.accessoryInfoPath)
      this.setupCode = this.generateSetupCode(accessoryInfo)
      return this.setupCode
    }
  }

  /**
   * Generates the setup code
   */
  private generateSetupCode(accessoryInfo: any): string {
    // this code is from https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/Accessory.js#L369
    const buffer = alloc(8)
    let valueLow = Number.parseInt(accessoryInfo.pincode.replace(/-/g, ''), 10)
    const valueHigh = accessoryInfo.category >> 1

    valueLow |= 1 << 28 // Supports IP;

    buffer.writeUInt32BE(valueLow, 4)

    if (accessoryInfo.category & 1) {
      buffer[4] = buffer[4] | 1 << 7
    }

    buffer.writeUInt32BE(valueHigh, 0)

    let encodedPayload = (buffer.readUInt32BE(4) + (buffer.readUInt32BE(0) * 2 ** 32)).toString(36).toUpperCase()

    if (encodedPayload.length !== 9) {
      for (let i = 0; i <= 9 - encodedPayload.length; i++) {
        encodedPayload = `0${encodedPayload}`
      }
    }

    return `X-HM://${encodedPayload}${accessoryInfo.setupID}`
  }

  /**
   * Return the current pairing information for the main bridge
   */
  public async getBridgePairingInformation() {
    if (!await pathExists(this.accessoryInfoPath)) {
      return new ServiceUnavailableException('Pairing Information Not Available Yet')
    }

    const accessoryInfo = await readJson(this.accessoryInfoPath)

    return {
      displayName: accessoryInfo.displayName,
      pincode: accessoryInfo.pincode,
      setupCode: await this.getSetupCode(),
      isPaired: accessoryInfo.pairedClients && Object.keys(accessoryInfo.pairedClients).length > 0,
    }
  }

  /**
   * Returns a list of network adapters on the current host
   */
  public async getSystemNetworkInterfaces(): Promise<Systeminformation.NetworkInterfacesData[]> {
    const fromCache: Systeminformation.NetworkInterfacesData[] = this.serverServiceCache.get('network-interfaces')

    // See https://github.com/sebhildebrandt/systeminformation/issues/775#issuecomment-1741836906
    // @ts-expect-error - These ts-ignore should be able to be removed in the next major release of 'systeminformation' (v6)
    const interfaces = fromCache || (await networkInterfaces()).filter((adapter: any) => {
      return !adapter.internal
        && (adapter.ip4 || (adapter.ip6))
    })

    if (!fromCache) {
      this.serverServiceCache.set('network-interfaces', interfaces)
    }

    return interfaces
  }

  /**
   * Returns a list of network adapters the bridge is currently configured to listen on
   */
  public async getHomebridgeNetworkInterfaces() {
    const config = await this.configEditorService.getConfigFile()

    if (!config.bridge?.bind) {
      return []
    }

    if (Array.isArray(config.bridge?.bind)) {
      return config.bridge.bind
    }

    if (typeof config.bridge?.bind === 'string') {
      return [config.bridge.bind]
    }

    return []
  }

  /**
   * Return the current setting for the config.bridge.advertiser value
   */
  public async getHomebridgeMdnsSetting(): Promise<HomebridgeMdnsSettingDto> {
    const config = await this.configEditorService.getConfigFile()

    if (!config.bridge.advertiser) {
      config.bridge.advertiser = 'bonjour-hap'
    }

    return {
      advertiser: config.bridge.advertiser,
    }
  }

  /**
   * Return the current setting for the config.bridge.advertiser value
   */
  public async setHomebridgeMdnsSetting(setting: HomebridgeMdnsSettingDto) {
    const config = await this.configEditorService.getConfigFile()

    config.bridge.advertiser = setting.advertiser

    await this.configEditorService.updateConfigFile(config)
  }

  /**
   * Set the bridge interfaces
   */
  public async setHomebridgeNetworkInterfaces(adapters: string[]) {
    const config = await this.configEditorService.getConfigFile()

    if (!config.bridge) {
      config.bridge = {} as HomebridgeConfig['bridge']
    }

    if (!adapters.length) {
      delete config.bridge.bind
    } else {
      config.bridge.bind = adapters
    }

    await this.configEditorService.updateConfigFile(config)
  }

  /**
   * Generate a random, unused port and return it
   */
  public async lookupUnusedPort() {
    const randomPort = () => Math.floor(Math.random() * (60000 - 30000 + 1) + 30000)

    let port = randomPort()
    while (await tcpCheck(port)) {
      port = randomPort()
    }

    return { port }
  }

  /**
   * Check if the system Node.js version has changed
   */
  private async nodeVersionChanged(): Promise<boolean> {
    return new Promise((res) => {
      let result = false

      const child = spawn(process.execPath, ['-v'])

      child.stdout.once('data', (data) => {
        result = data.toString().trim() !== process.version
      })

      child.on('error', () => {
        result = true
      })

      child.on('close', () => {
        return res(result)
      })
    })
  }
}
