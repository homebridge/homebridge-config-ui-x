import type { MultipartFile } from '@fastify/multipart'
import type { Systeminformation } from 'systeminformation'

import { Buffer } from 'node:buffer'
import { exec, spawn } from 'node:child_process'
import { extname, join, resolve } from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'

import { Categories } from '@homebridge/hap-client/dist/hap-types'
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  createWriteStream,
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

import { ConfigService, HomebridgeConfig } from '../../core/config/config.service'
import { HomebridgeIpcService } from '../../core/homebridge-ipc/homebridge-ipc.service'
import { Logger } from '../../core/logger/logger.service'
import { AccessoriesService } from '../accessories/accessories.service'
import { ConfigEditorService } from '../config-editor/config-editor.service'
import { HomebridgeMdnsSettingDto } from './server.dto'

const pump = promisify(pipeline)

@Injectable()
export class ServerService {
  private serverServiceCache = new NodeCache({ stdTTL: 300 })

  private readonly accessoryId: string
  private readonly accessoryInfoPath: string

  public setupCode: string | null = null
  public paired: boolean = false

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
   * Delete the cached accessory files for a single bridge.
   * @param id
   * @param cachedAccessoriesDir
   * @private
   */
  private async deleteSingleDeviceAccessories(id: string, cachedAccessoriesDir: string) {
    const cachedAccessories = join(cachedAccessoriesDir, `cachedAccessories.${id}`)
    const cachedAccessoriesBackup = join(cachedAccessoriesDir, `.cachedAccessories.${id}.bak`)

    if (await pathExists(cachedAccessories)) {
      await unlink(cachedAccessories)
      this.logger.warn(`Bridge ${id} accessory removal: removed ${cachedAccessories}.`)
    }

    if (await pathExists(cachedAccessoriesBackup)) {
      await unlink(cachedAccessoriesBackup)
      this.logger.warn(`Bridge ${id} accessory removal: removed ${cachedAccessoriesBackup}.`)
    }
  }

  /**
   * Delete the pairing information for a single bridge.
   * @param id
   * @param resetPairingInfo
   * @private
   */
  private async deleteSingleDevicePairing(id: string, resetPairingInfo: boolean) {
    const persistPath = join(this.configService.storagePath, 'persist')
    const accessoryInfo = join(persistPath, `AccessoryInfo.${id}.json`)
    const identifierCache = join(persistPath, `IdentifierCache.${id}.json`)

    try {
      const configFile = await this.configEditorService.getConfigFile()
      const username = id.match(/.{1,2}/g).join(':').toUpperCase()

      // Check if the original username is in the access list, if so, update it to the new username
      const uiConfig = configFile.platforms.find(x => x.platform === 'config')
      let blacklistChanged = false
      if (uiConfig.accessoryControl?.instanceBlacklist?.includes(username)) {
        // Remove the old username from the blacklist
        blacklistChanged = true
        uiConfig.accessoryControl.instanceBlacklist = uiConfig.accessoryControl.instanceBlacklist
          .filter((x: string) => x.toUpperCase() !== username)
      }

      // Only available for child bridges
      if (resetPairingInfo) {
        // An error thrown here should not interrupt the process, this is a convenience feature
        const pluginBlocks = configFile.accessories
          .concat(configFile.platforms)
          .concat([{ _bridge: configFile.bridge }])
          .filter((block: any) => block._bridge?.username?.toUpperCase() === username.toUpperCase())

        const pluginBlock = pluginBlocks.find((block: any) => block._bridge?.port)
        const otherBlocks = pluginBlocks.filter((block: any) => !block._bridge?.port)

        if (pluginBlock) {
          // Generate new random username and pin, and save the config file
          pluginBlock._bridge.username = this.configEditorService.generateUsername()
          pluginBlock._bridge.pin = this.configEditorService.generatePin()

          // Multiple blocks may share the same username, for accessory blocks that are part of the same bridge
          otherBlocks.forEach((block: any) => {
            block._bridge.username = pluginBlock._bridge.username
          })

          // Add the new username to the blacklist if it was previously there
          if (blacklistChanged) {
            uiConfig.accessoryControl.instanceBlacklist = uiConfig.accessoryControl.instanceBlacklist
              .concat(pluginBlock._bridge.username.toUpperCase())
          }

          this.logger.warn(`Bridge ${id} reset: new username: ${pluginBlock._bridge.username} and new pin: ${pluginBlock._bridge.pin}.`)
        } else {
          this.logger.error(`Failed to reset username and pin for child bridge ${id} as the plugin block could not be found.`)
        }
      }

      if (blacklistChanged) {
        uiConfig.accessoryControl.instanceBlacklist = uiConfig.accessoryControl.instanceBlacklist
          .sort((a: string, b: string) => a.localeCompare(b))
      }

      await this.configEditorService.updateConfigFile(configFile)
    } catch (e) {
      this.logger.error(`Failed to reset username and pin for child bridge ${id} as ${e.message}.`)
    }

    if (await pathExists(accessoryInfo)) {
      await unlink(accessoryInfo)
      this.logger.warn(`Bridge ${id} reset: removed ${accessoryInfo}.`)
    }

    if (await pathExists(identifierCache)) {
      await unlink(identifierCache)
      this.logger.warn(`Bridge ${id} reset: removed ${identifierCache}.`)
    }

    await this.deleteDeviceAccessories(id)
  }

  /**
   * Restart the server
   */
  public async restartServer() {
    this.logger.log('Homebridge restart request received.')

    if (!await this.configService.uiRestartRequired() && !await this.nodeVersionChanged()) {
      this.logger.log('UI/Bridge settings have not changed - only restarting Homebridge process.')
      // Restart homebridge by killing child process
      this.homebridgeIpcService.restartHomebridge()

      // Reset the pool of discovered homebridge instances
      this.accessoriesService.resetInstancePool()
      return { ok: true, command: 'SIGTERM', restartingUI: false }
    }

    setTimeout(() => {
      if (this.configService.ui.restart) {
        this.logger.log(`Executing restart command ${this.configService.ui.restart}.`)
        exec(this.configService.ui.restart, (err) => {
          if (err) {
            this.logger.log('Restart command exited with an error, failed to restart Homebridge.')
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
    // Restart ui on next restart
    this.configService.hbServiceUiRestartRequired = true

    const configFile = await this.configEditorService.getConfigFile()
    const oldUsername = configFile.bridge.username

    // Generate new random username and pin
    configFile.bridge.pin = this.configEditorService.generatePin()
    configFile.bridge.username = this.configEditorService.generateUsername()

    // Check if the original username is in the access list, if so, update it to the new username
    const uiConfig = configFile.platforms.find(x => x.platform === 'config')
    if (uiConfig.accessoryControl?.instanceBlacklist?.includes(oldUsername.toUpperCase())) {
      // Remove the old username from the blacklist, add the new one, and sort the blacklist alphabetically
      uiConfig.accessoryControl.instanceBlacklist = uiConfig.accessoryControl.instanceBlacklist
        .filter((x: string) => x.toUpperCase() !== oldUsername.toUpperCase())
        .concat(configFile.bridge.pin)
        .sort((a: string, b: string) => a.localeCompare(b))
    }

    this.logger.warn(`Homebridge bridge reset: new username ${configFile.bridge.username} and new pin ${configFile.bridge.pin}.`)

    // Save the config file
    await this.configEditorService.updateConfigFile(configFile)

    // Remove accessories and persist directories
    await remove(resolve(this.configService.storagePath, 'accessories'))
    await remove(resolve(this.configService.storagePath, 'persist'))

    this.logger.log('Homebridge bridge reset: accessories and persist directories were removed.')
  }

  /**
   * Return a list of the device pairings in the homebridge persist folder
   */
  public async getDevicePairings() {
    const persistPath = join(this.configService.storagePath, 'persist')

    const devices = (await readdir(persistPath))
      .filter(x => x.match(/AccessoryInfo\.([A-Fa-f0-9]+)\.json$/))

    const configFile = await this.configEditorService.getConfigFile()

    return Promise.all(devices.map(async (x) => {
      return await this.getDevicePairingById(x.split('.')[1], configFile)
    }))
  }

  /**
   * Return a single device pairing
   * @param deviceId
   * @param configFile
   */
  public async getDevicePairingById(deviceId: string, configFile = null) {
    const persistPath = join(this.configService.storagePath, 'persist')

    let device: any
    try {
      device = await readJson(join(persistPath, `AccessoryInfo.${deviceId}.json`))
    } catch (e) {
      throw new NotFoundException()
    }

    if (!configFile) {
      configFile = await this.configEditorService.getConfigFile()
    }

    const username = deviceId.match(/.{1,2}/g).join(':')
    const isMain = this.configService.homebridgeConfig.bridge.username.toUpperCase() === username.toUpperCase()
    const pluginBlock = configFile.accessories
      .concat(configFile.platforms)
      .concat([{ _bridge: configFile.bridge }])
      .find((block: any) => block._bridge?.username?.toUpperCase() === username.toUpperCase())

    try {
      device._category = Object.entries(Categories).find(([, value]) => value === device.category)[0].toLowerCase()
    } catch (e) {
      device._category = 'Other'
    }

    device.name = pluginBlock?._bridge.name || pluginBlock?.name || device.displayName
    device._id = deviceId
    device._username = username
    device._main = isMain
    device._isPaired = device.pairedClients && Object.keys(device.pairedClients).length > 0
    device._setupCode = this.generateSetupCode(device)
    device._couldBeStale = !device._main && device._category === 'bridge' && !pluginBlock

    // Filter out some properties
    delete device.signSk
    delete device.signPk
    delete device.configHash
    delete device.pairedClients
    delete device.pairedClientsPermission

    return device
  }

  /**
   * Remove a device pairing
   */
  public async deleteDevicePairing(id: string, resetPairingInfo: boolean) {
    this.logger.warn(`Shutting down Homebridge before resetting paired bridge ${id}...`)

    // Wait for homebridge to stop
    await this.homebridgeIpcService.restartAndWaitForClose()

    // Remove the bridge cache files
    await this.deleteSingleDevicePairing(id, resetPairingInfo)

    return { ok: true }
  }

  /**
   * Remove multiple device pairings
   */
  public async deleteDevicesPairing(bridges: { id: string, resetPairingInfo: boolean }[]) {
    this.logger.warn(`Shutting down Homebridge before resetting paired bridges ${bridges.map(x => x.id).join(', ')}...`)

    // Wait for homebridge to stop
    await this.homebridgeIpcService.restartAndWaitForClose()

    for (const { id, resetPairingInfo } of bridges) {
      try {
        // Remove the bridge cache files
        await this.deleteSingleDevicePairing(id, resetPairingInfo)
      } catch (e) {
        this.logger.error(`Failed to reset paired bridge ${id} as ${e.message}.`)
      }
    }

    return { ok: true }
  }

  /**
   * Remove a device's accessories
   */
  public async deleteDeviceAccessories(id: string) {
    this.logger.warn(`Shutting down Homebridge before removing accessories for paired bridge ${id}...`)

    // Wait for homebridge to stop.
    await this.homebridgeIpcService.restartAndWaitForClose()

    const cachedAccessoriesDir = join(this.configService.storagePath, 'accessories')

    await this.deleteSingleDeviceAccessories(id, cachedAccessoriesDir)
  }

  /**
   * Remove multiple devices' accessories
   */
  public async deleteDevicesAccessories(bridges: { id: string }[]) {
    this.logger.warn(`Shutting down Homebridge before removing accessories for paired bridges ${bridges.map(x => x.id).join(', ')}...`)

    // Wait for homebridge to stop.
    await this.homebridgeIpcService.restartAndWaitForClose()

    const cachedAccessoriesDir = join(this.configService.storagePath, 'accessories')

    for (const { id } of bridges) {
      try {
        await this.deleteSingleDeviceAccessories(id, cachedAccessoriesDir)
      } catch (e) {
        this.logger.error(`Failed to remove accessories for bridge ${id} as ${e.message}.`)
      }
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

    const cachedAccessoriesPath = resolve(this.configService.storagePath, 'accessories', cacheFile)

    this.logger.warn(`Shutting down Homebridge before removing cached accessory ${uuid}...`)

    // Wait for homebridge to stop.
    await this.homebridgeIpcService.restartAndWaitForClose()

    const cachedAccessories = await readJson(cachedAccessoriesPath) as Array<any>
    const accessoryIndex = cachedAccessories.findIndex(x => x.UUID === uuid)

    if (accessoryIndex > -1) {
      cachedAccessories.splice(accessoryIndex, 1)
      await writeJson(cachedAccessoriesPath, cachedAccessories)
      this.logger.warn(`Removed cached accessory with UUID ${uuid} from file ${cacheFile}.`)
    } else {
      this.logger.error(`Cannot find cached accessory with UUID ${uuid} from file ${cacheFile}.`)
      throw new NotFoundException()
    }

    return { ok: true }
  }

  /**
   * Remove multiple cached accessories
   */
  public async deleteCachedAccessories(accessories: { uuid: string, cacheFile: string }[]) {
    this.logger.warn(`Shutting down Homebridge before removing cached accessories ${accessories.map(x => x.uuid).join(', ')}.`)

    // Wait for homebridge to stop.
    await this.homebridgeIpcService.restartAndWaitForClose()

    const accessoriesByCacheFile = new Map<string, { uuid: string }[]>()

    // Group accessories by cacheFile
    for (const { cacheFile, uuid } of accessories) {
      const accessoryCacheFile = cacheFile || 'cachedAccessories'
      if (!accessoriesByCacheFile.has(accessoryCacheFile)) {
        accessoriesByCacheFile.set(accessoryCacheFile, [])
      }
      accessoriesByCacheFile.get(accessoryCacheFile).push({ uuid })
    }

    // Process each group of accessories
    for (const [cacheFile, accessories] of accessoriesByCacheFile.entries()) {
      const cachedAccessoriesPath = resolve(this.configService.storagePath, 'accessories', cacheFile)
      const cachedAccessories = await readJson(cachedAccessoriesPath) as Array<any>
      for (const { uuid } of accessories) {
        try {
          const accessoryIndex = cachedAccessories.findIndex(x => x.UUID === uuid)
          if (accessoryIndex > -1) {
            cachedAccessories.splice(accessoryIndex, 1)
            this.logger.warn(`Removed cached accessory with UUID ${uuid} from file ${cacheFile}.`)
          } else {
            this.logger.error(`Cannot find cached accessory with UUID ${uuid} from file ${cacheFile}.`)
          }
        } catch (e) {
          this.logger.error(`Failed to remove cached accessory with UUID ${uuid} from file ${cacheFile} as ${e.message}.`)
        }
      }
      await writeJson(cachedAccessoriesPath, cachedAccessories)
    }

    return { ok: true }
  }

  /**
   * Clears the Homebridge Accessory Cache
   */
  public async deleteAllCachedAccessories() {
    const cachedAccessoriesDir = join(this.configService.storagePath, 'accessories')
    const cachedAccessoryPaths = (await readdir(cachedAccessoriesDir))
      .filter(x => x.match(/cachedAccessories\.([A-F,0-9]+)/) || x === 'cachedAccessories' || x === '.cachedAccessories.bak')
      .map(x => resolve(cachedAccessoriesDir, x))

    const cachedAccessoriesPath = resolve(this.configService.storagePath, 'accessories', 'cachedAccessories')

    // Wait for homebridge to stop.
    await this.homebridgeIpcService.restartAndWaitForClose()

    this.logger.warn('Shutting down Homebridge before removing cached accessories')

    try {
      this.logger.log('Clearing all cached accessories...')
      for (const thisCachedAccessoriesPath of cachedAccessoryPaths) {
        if (await pathExists(thisCachedAccessoriesPath)) {
          await unlink(thisCachedAccessoriesPath)
          this.logger.warn(`Removed ${thisCachedAccessoriesPath}.`)
        }
      }
    } catch (e) {
      this.logger.error(`Failed to clear all cached accessories at ${cachedAccessoriesPath} as ${e.message}.`)
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
    const buffer = Buffer.allocUnsafe(8)
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
   * Get the Homebridge port
   */
  public async getHomebridgePort(): Promise<{ port: number }> {
    const config = await this.configEditorService.getConfigFile()

    return { port: config.bridge.port }
  }

  /**
   * Get the usable ports
   */
  public async getUsablePorts(): Promise<{ start?: number, end?: number }> {
    const config = await this.configEditorService.getConfigFile()

    // config.ports may not exist
    let start: number
    let end: number

    if (config.ports && typeof config.ports === 'object') {
      if (config.ports.start) {
        start = config.ports.start
      }
      if (config.ports.end) {
        end = config.ports.end
      }
    }

    return { start, end }
  }

  /**
   * Set the Homebridge name
   */
  public async setHomebridgeName(name: string): Promise<void> {
    // https://github.com/homebridge/HAP-NodeJS/blob/ee41309fd9eac383cdcace39f4f6f6a3d54396f3/src/lib/util/checkName.ts#L12
    if (!name || !(/^[\p{L}\p{N}][\p{L}\p{N} ']*[\p{L}\p{N}]$/u).test(name)) {
      throw new BadRequestException('Invalid name')
    }

    const config = await this.configEditorService.getConfigFile()

    config.bridge.name = name

    await this.configEditorService.updateConfigFile(config)
  }

  /**
   * Set the Homebridge port
   */
  public async setHomebridgePort(port: number): Promise<void> {
    // Validate port is between 1 and 65535
    if (!port || typeof port !== 'number' || !Number.isInteger(port) || port < 1025 || port > 65533) {
      throw new BadRequestException('Invalid port number')
    }

    const config = await this.configEditorService.getConfigFile()

    config.bridge.port = port

    await this.configEditorService.updateConfigFile(config)
  }

  /**
   * Set the usable ports in the config file
   */
  public async setUsablePorts(value: { start?: number, end?: number }) {
    // 1. Get the current config
    let config = await this.configEditorService.getConfigFile()

    // 2. Validate the input
    if (value.start === null) {
      delete value.start
    }
    if (value.end === null) {
      delete value.end
    }

    if ('start' in value && (typeof value.start !== 'number' || value.start < 1025 || value.start > 65533)) {
      throw new BadRequestException('Port start must be a number between 1025 and 65533.')
    }
    if ('end' in value && (typeof value.end !== 'number' || value.end < 1025 || value.end > 65533)) {
      throw new BadRequestException('Port end must be a number between 1025 and 65533.')
    }
    if ('start' in value && 'end' in value && value.start >= value.end) {
      throw new BadRequestException('Ports start must be less than end.')
    }
    if ('start' in value && !('end' in value) && config.ports?.end && value.start >= config.ports.end) {
      throw new BadRequestException('Ports start must be less than end.')
    }
    if ('end' in value && !('start' in value) && config.ports?.start && config.ports.start >= value.end) {
      throw new BadRequestException('Ports start must be less than end.')
    }

    // 3. Update the config with the new ports
    // Remove ports if neither start nor end is specified
    if (!value.start && !value.end) {
      delete config.ports
    } else {
      config.ports = {}
      if (value.start) {
        config.ports.start = value.start
      }
      if (value.end) {
        config.ports.end = value.end
      }
    }

    // 4. Bring the ports object to the front of the config, after the bridge object
    const { bridge, ports, ...rest } = config
    config = ports ? { bridge, ports, ...rest } : { bridge, ...rest }

    // 5. Save the config file
    await this.configEditorService.updateConfigFile(config)
  }

  /**
   * Upload and set a new wallpaper. Will delete an old wallpaper if it exists.
   * File upload handler
   */
  public async uploadWallpaper(data: MultipartFile) {
    // Get the config file and find the UI config block
    const configFile = await this.configEditorService.getConfigFile()
    const uiConfigBlock = configFile.platforms.find(x => x.platform === 'config')

    if (uiConfigBlock) {
      // Delete the old wallpaper if it exists
      if (uiConfigBlock.wallpaper) {
        const oldPath = join(this.configService.storagePath, uiConfigBlock.wallpaper)
        if (await pathExists(oldPath)) {
          try {
            await unlink(oldPath)
            this.logger.log(`Old wallpaper file ${oldPath} deleted successfully.`)
          } catch (e) {
            this.logger.error(`Failed to delete old wallpaper ${oldPath} as ${e.message}.`)
          }
        }
      }

      // Save the uploaded image file to the storage path
      const fileExtension = extname(data.filename)
      const newPath = join(this.configService.storagePath, `ui-wallpaper${fileExtension}`)
      await pump(data.file, createWriteStream(newPath))

      // Update the config file with the new wallpaper path
      uiConfigBlock.wallpaper = `ui-wallpaper${fileExtension}`
      await this.configEditorService.updateConfigFile(configFile)
      this.logger.log('Wallpaper uploaded and set in the config file.')
    }
  }

  /**
   * Delete the current wallpaper if it exists.
   */
  public async deleteWallpaper(): Promise<void> {
    // Get the config file and find the UI config block
    const configFile = await this.configEditorService.getConfigFile()
    const uiConfigBlock = configFile.platforms.find(x => x.platform === 'config')
    const fullPath = join(this.configService.storagePath, uiConfigBlock.wallpaper)

    // Delete the wallpaper file if it exists
    if (uiConfigBlock && uiConfigBlock.wallpaper) {
      if (await pathExists(fullPath)) {
        try {
          await unlink(fullPath)
          this.logger.log(`Wallpaper file ${uiConfigBlock.wallpaper} deleted successfully.`)
        } catch (e) {
          this.logger.error(`Failed to delete wallpaper file (${uiConfigBlock.wallpaper}) as ${e.message}.`)
        }
      }

      // Remove the wallpaper path from the config file
      delete uiConfigBlock.wallpaper
      await this.configEditorService.updateConfigFile(configFile)
      this.configService.removeWallpaperCache()
      this.logger.log('Wallpaper reference removed from the config file.')
    }
  }

  /**
   * Check if the system Node.js version has changed
   */
  private async nodeVersionChanged(): Promise<boolean> {
    return new Promise((res) => {
      let result = false

      const child = spawn(process.execPath, ['-v'], { shell: true })

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
