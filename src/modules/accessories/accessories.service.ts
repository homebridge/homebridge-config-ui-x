import type { ServiceType } from '@homebridge/hap-client'
import type { Socket } from 'socket.io'

import type {
  AccessoryControlMessage,
  MatterAccessoriesResponse,
  MatterAccessory,
  MatterAccessoryInfo,
  MatterAccessoryPart,
  MatterControlResponse,
  MatterEvent,
  MatterService,
  MatterStateUpdate,
} from './accessories.interfaces.js'

import { join } from 'node:path'

import { HapClient } from '@homebridge/hap-client'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { mkdirp, pathExists, readJson, writeJsonSync } from 'fs-extra/esm'
import NodeCache from 'node-cache'

import { ConfigService } from '../../core/config/config.service.js'
import { HomebridgeIpcService } from '../../core/homebridge-ipc/homebridge-ipc.service.js'
import { Logger } from '../../core/logger/logger.service.js'

@Injectable()
export class AccessoriesService {
  public hapClient: HapClient
  public accessoriesCache = new NodeCache({ stdTTL: 0 })

  // Matter monitoring state
  private matterMonitoringActive = false
  private matterUpdateListener: ((event: MatterEvent) => void) | null = null
  private activeClients = new Set<Socket>()
  private matterAccessories: MatterService[] = []

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(Logger) private readonly logger: Logger,
    @Inject(HomebridgeIpcService) private readonly homebridgeIpcService: HomebridgeIpcService,
  ) {
    if (this.configService.homebridgeInsecureMode) {
      this.hapClient = new HapClient({
        pin: this.configService.homebridgeConfig.bridge.pin,
        logger: this.logger,
        config: this.configService.ui.accessoryControl || {},
      })
    }
  }

  /**
   * Connects the client to the homebridge service
   * @param client
   */
  public async connect(client: Socket) {
    if (!this.configService.homebridgeInsecureMode) {
      this.logger.error('Homebridge must be running in insecure mode to control accessories.')
      return
    }

    // Track this client
    this.activeClients.add(client)

    // If this is the first client, start Matter monitoring
    if (this.activeClients.size === 1) {
      await this.startMatterMonitoring()
    }

    let services: (ServiceType | MatterService)[]

    const loadAllAccessories = async (refresh: boolean) => {
      if (!refresh) {
        const cached = this.accessoriesCache.get<(ServiceType | MatterService)[]>('services')
        if (cached && cached.length) {
          client.emit('accessories-data', cached)
        }
      }

      // Load HAP accessories first
      const hapServices = await this.loadAccessories()
      this.refreshCharacteristics(hapServices)

      // Emit HAP ready immediately so HAP accessories can be controlled
      client.emit('hap-accessories-ready-for-control')
      client.emit('accessories-data', hapServices)

      // Load Matter accessories (may be slower due to IPC)
      const matterServices = await this.loadMatterAccessories()

      // Emit Matter ready
      client.emit('matter-accessories-ready-for-control')
      if (matterServices.length > 0) {
        client.emit('accessories-data', matterServices)
      }

      // Merge both for caching and legacy compatibility
      services = [...hapServices, ...matterServices]
      this.accessoriesCache.set('services', services)
    }

    // Initial load
    await loadAllAccessories(false)

    // Handling incoming requests
    const requestHandler = async (msg?: AccessoryControlMessage) => {
      if (msg.refresh) {
        // Reload all accessories (typically triggered by Matter accessory changes)
        await loadAllAccessories(true)
      } else if (msg.set) {
        // Check if this is a Matter accessory
        if (msg.set.uniqueId && msg.set.uniqueId.startsWith('matter:')) {
          if (msg.set.cluster && msg.set.attributes) {
            await this.handleMatterControl(client, {
              uniqueId: msg.set.uniqueId,
              cluster: msg.set.cluster,
              attributes: msg.set.attributes,
            })
          }
        } else {
          // HAP accessory (existing logic)
          const service = services.find(x => x.uniqueId === msg.set.uniqueId)
          if (service && 'serviceCharacteristics' in service) {
            try {
              await service.setCharacteristic(msg.set.iid, msg.set.value)
              const hapServices = await this.loadAccessories()

              // Do a refresh to check if any accessories changed after this action
              setTimeout(() => {
                this.refreshCharacteristics(hapServices)
              }, 1500)
              // Update services list with new HAP services
              services = [...hapServices, ...this.matterAccessories]
            } catch (e) {
              client.emit('accessory-control-failure', e.message)
            }
          }
        }
      }
    }
    client.on('accessory-control', requestHandler)

    const monitor = await this.hapClient.monitorCharacteristics()

    const updateHandler = (data: ServiceType | MatterService) => {
      client.emit('accessories-data', data)
    }
    monitor.on('service-update', updateHandler)

    const instanceUpdateHandler = async () => {
      client.emit('accessories-reload-required', services)
    }
    this.hapClient.on('instance-discovered', instanceUpdateHandler)

    // Load a second time in case anything was missed
    const secondaryLoadTimeout = setTimeout(async () => {
      await loadAllAccessories(true)
    }, 3000)

    // Clean up on disconnect
    const onEnd = () => {
      clearTimeout(secondaryLoadTimeout)
      client.removeAllListeners('end')
      client.removeAllListeners('disconnect')
      client.removeAllListeners('accessory-control')
      monitor.removeAllListeners('service-update')
      monitor.finish()
      this.hapClient.removeListener('instance-discovered', instanceUpdateHandler)

      // Remove client from active clients
      this.activeClients.delete(client)

      // If no more clients, stop Matter monitoring
      if (this.activeClients.size === 0) {
        this.stopMatterMonitoring()
      }
    }

    client.on('disconnect', onEnd.bind(this))
    client.on('end', onEnd.bind(this))

    // Send a refresh instances request
    this.hapClient.refreshInstances()
  }

  /**
   * Refresh the characteristics from Homebridge
   * @param services
   */
  private refreshCharacteristics(services: ServiceType[]) {
    Promise.all(services.map(service =>
      service.refreshCharacteristics().catch((error) => {
        this.logger.error(`Failed to refresh characteristics for service ${service.uniqueId}: ${error.message}`)
      }),
    )).catch((error) => {
      this.logger.warn(`Failed to refresh characteristics: ${error.message}`)
    })
  }

  /**
   * Load all the accessories from Homebridge
   */
  public async loadAccessories(): Promise<ServiceType[]> {
    if (!this.configService.homebridgeInsecureMode) {
      throw new BadRequestException('Homebridge must be running in insecure mode to access accessories.')
    }

    try {
      return await this.hapClient.getAllServices()
    } catch (e) {
      if (e.response?.status === 401) {
        this.logger.warn('Homebridge must be running in insecure mode to view and control accessories from this plugin.')
      } else {
        this.logger.error(`Failed to load accessories from Homebridge as ${e.message}.`)
      }
      return []
    }
  }

  /**
   * Get a single accessory and refresh its characteristics
   * @param uniqueId
   */
  public async getAccessory(uniqueId: string) {
    // Check if this is a Matter accessory
    if (uniqueId.startsWith('matter:')) {
      return this.getMatterAccessory(uniqueId)
    }

    // HAP accessory (existing logic)
    const services = await this.loadAccessories()
    const service = services.find(x => x.uniqueId === uniqueId)

    if (!service) {
      throw new BadRequestException(`Service with uniqueId of '${uniqueId}' not found.`)
    }

    try {
      await service.refreshCharacteristics()
      return service
    } catch (e) {
      throw new BadRequestException(e.message)
    }
  }

  /**
   * Get a single Matter accessory with detailed info
   * @param uniqueId
   */
  private async getMatterAccessory(uniqueId: string): Promise<MatterService> {
    try {
      const { uuid, partId } = this.parseMatterUniqueId(uniqueId)

      // Request detailed info via IPC using unified Matter event channel
      const response = await this.waitForMatterEvent<MatterAccessoryInfo>('accessoryInfo', () => {
        this.homebridgeIpcService.sendMessage('getMatterAccessoryInfo', { uuid })
      })

      if (response.error) {
        throw new BadRequestException(response.error)
      }

      // If asking for a part, find it
      if (partId) {
        const part = response.parts?.find((p: MatterAccessoryPart) => p.id === partId)
        if (part) {
          return this.transformMatterAccessory(response, part)
        }
        throw new BadRequestException(`Part '${partId}' not found in accessory`)
      }

      return this.transformMatterAccessory(response)
    } catch (error) {
      this.logger.error(`Failed to get Matter accessory info for ${uniqueId}:`, error)
      throw new BadRequestException(error.message || 'Failed to get Matter accessory info')
    }
  }

  /**
   * Set a characteristics value
   * @param uniqueId
   * @param characteristicType
   * @param value
   */
  public async setAccessoryCharacteristic(uniqueId: string, characteristicType: string, value: number | boolean | string) {
    const services = await this.loadAccessories()
    const service = services.find(x => x.uniqueId === uniqueId)

    if (!service) {
      throw new BadRequestException(`Service with uniqueId of '${uniqueId}' not found.`)
    }

    const characteristic = service.getCharacteristic(characteristicType)

    if (!characteristic || !characteristic.canWrite) {
      const types = service.serviceCharacteristics.filter(x => x.canWrite).map(x => `'${x.type}'`).join(', ')
      throw new BadRequestException(`Invalid characteristicType. Valid types are: ${types}.`)
    }

    // Integers
    if (['uint8', 'uint16', 'uint32', 'uint64'].includes(characteristic.format)) {
      value = Number.parseInt(value as string, 10)
      if (characteristic.minValue !== undefined && value < characteristic.minValue) {
        throw new BadRequestException(`Invalid value. The value must be between ${characteristic.minValue} and ${characteristic.maxValue}.`)
      }
      if (characteristic.maxValue !== undefined && value > characteristic.maxValue) {
        throw new BadRequestException(`Invalid value. The value must be between ${characteristic.minValue} and ${characteristic.maxValue}.`)
      }
    }

    // Floats
    if (characteristic.format === 'float') {
      value = Number.parseFloat(value as string)
      if (characteristic.minValue !== undefined && value < characteristic.minValue) {
        throw new BadRequestException(`Invalid value. The value must be between ${characteristic.minValue} and ${characteristic.maxValue}.`)
      }
      if (characteristic.maxValue !== undefined && value > characteristic.maxValue) {
        throw new BadRequestException(`Invalid value. The value must be between ${characteristic.minValue} and ${characteristic.maxValue}.`)
      }
    }

    // Booleans
    if (characteristic.format === 'bool') {
      if (typeof value === 'string') {
        if (['true', '1'].includes(value.toLowerCase())) {
          value = true
        } else if (['false', '0'].includes(value.toLowerCase())) {
          value = false
        }
      } else if (typeof value === 'number') {
        value = value === 1
      }

      if (typeof value !== 'boolean') {
        throw new BadRequestException('Invalid value. The value must be a boolean (true or false).')
      }
    }

    try {
      await characteristic.setValue(value)
      await service.refreshCharacteristics()
      return service
    } catch (e) {
      throw new BadRequestException(e.message)
    }
  }

  /**
   * Get the accessory layout
   */
  public async getAccessoryLayout(username: string) {
    try {
      const accessoryLayout = await readJson(this.configService.accessoryLayoutPath)
      if (username in accessoryLayout) {
        return accessoryLayout[username]
      } else {
        throw new Error('User not in Accessory Layout')
      }
    } catch (e) {
      return [
        {
          name: 'Default Room',
          services: [],
        },
      ]
    }
  }

  /**
   * Saves the accessory layout
   * @param user
   * @param layout
   */
  public async saveAccessoryLayout(user: string, layout: Record<string, unknown>) {
    let accessoryLayout: any

    try {
      accessoryLayout = await readJson(this.configService.accessoryLayoutPath)
    } catch (e) {
      accessoryLayout = {}
    }

    if (!await pathExists(join(this.configService.storagePath, 'accessories'))) {
      await mkdirp(join(this.configService.storagePath, 'accessories'))
    }

    accessoryLayout[user] = layout
    writeJsonSync(this.configService.accessoryLayoutPath, accessoryLayout)
    this.logger.log(`Accessory layout changes saved for ${user}.`)
    return layout
  }

  /**
   * Reset the instance pool and do a full scan for Homebridge instances
   */
  public resetInstancePool() {
    if (this.configService.homebridgeInsecureMode) {
      this.hapClient.resetInstancePool()
    }
  }

  /**
   * Parse a Matter uniqueId into its components
   */
  private parseMatterUniqueId(uniqueId: string): { uuid: string, partId?: string } {
    const parts = uniqueId.replace('matter:', '').split(':')
    return {
      uuid: parts[0],
      partId: parts[1],
    }
  }

  /**
   * Build a Matter uniqueId from components
   */
  private buildMatterUniqueId(uuid: string, partId?: string): string {
    return partId ? `matter:${uuid}:${partId}` : `matter:${uuid}`
  }

  /**
   * Wait for a specific Matter event type
   * Matter events use a unified 'matterEvent' channel with different types
   */
  private async waitForMatterEvent<T = unknown>(eventType: string, sendRequest: () => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const actionTimeout = setTimeout(() => {
        // eslint-disable-next-line ts/no-use-before-define
        this.homebridgeIpcService.removeListener('matterEvent', listener)
        reject(new Error('The Homebridge service did not respond'))
      }, 3000)

      const listener = (event: MatterEvent) => {
        // Only resolve if this is the event type we're waiting for
        if (event.type === eventType) {
          clearTimeout(actionTimeout)
          this.homebridgeIpcService.removeListener('matterEvent', listener)
          resolve(event.data as T)
        }
      }

      this.homebridgeIpcService.on('matterEvent', listener)
      sendRequest()
    })
  }

  /**
   * Start Matter monitoring via IPC
   */
  private async startMatterMonitoring(): Promise<void> {
    // Check if Matter support is enabled
    const featureFlags = this.configService.getFeatureFlags()
    if (!featureFlags.matterSupport) {
      return // Matter support not enabled
    }

    if (this.matterMonitoringActive) {
      return // Already monitoring
    }

    try {
      this.logger.debug('Starting Matter accessory monitoring')

      // Send IPC command to start monitoring
      this.homebridgeIpcService.sendMessage('startMatterMonitoring')

      this.matterMonitoringActive = true

      // Setup unified IPC listener for Matter events
      this.matterUpdateListener = (event: MatterEvent) => {
        switch (event.type) {
          case 'accessoryUpdate':
            // Handle state updates
            if (event.data && 'uuid' in event.data && 'cluster' in event.data) {
              this.handleMatterStateUpdate(event.data as MatterStateUpdate)
            }
            break

          case 'accessoryAdded':
          case 'accessoryRemoved':
            // Handle accessories added/removed events
            if (event.data && 'uuid' in event.data) {
              this.logger.debug(`Matter accessory ${event.type}: ${(event.data as { uuid: string }).uuid} - triggering reload`)
            }
            // Trigger a reload of only Matter accessories for all connected clients
            for (const client of this.activeClients) {
              client.emit('matter-accessories-reload-required')
            }
            break
        }
      }

      this.homebridgeIpcService.on('matterEvent', this.matterUpdateListener)

      this.logger.debug('Matter monitoring started successfully')
    } catch (error) {
      this.logger.error('Failed to start Matter monitoring:', error)
    }
  }

  /**
   * Stop Matter monitoring via IPC
   */
  private async stopMatterMonitoring(): Promise<void> {
    if (!this.matterMonitoringActive) {
      return // Not monitoring
    }

    try {
      this.logger.debug('Stopping Matter accessory monitoring')

      // Remove IPC listener
      if (this.matterUpdateListener) {
        this.homebridgeIpcService.removeListener('matterEvent', this.matterUpdateListener)
        this.matterUpdateListener = null
      }

      // Send IPC command to stop monitoring
      this.homebridgeIpcService.sendMessage('stopMatterMonitoring')

      this.matterMonitoringActive = false
      this.matterAccessories = []

      this.logger.debug('Matter monitoring stopped')
    } catch (error) {
      this.logger.error('Failed to stop Matter monitoring:', error)
    }
  }

  /**
   * Load Matter accessories via IPC
   */
  private async loadMatterAccessories(): Promise<MatterService[]> {
    // Check if Matter support is enabled
    const featureFlags = this.configService.getFeatureFlags()
    if (!featureFlags.matterSupport) {
      return []
    }

    if (!this.matterMonitoringActive) {
      this.logger.warn('Matter monitoring not active, skipping accessory load')
      return []
    }

    try {
      // Request Matter accessories via IPC using unified Matter event channel
      const response = await this.waitForMatterEvent<MatterAccessoriesResponse>('accessoriesData', () => {
        this.homebridgeIpcService.sendMessage('getMatterAccessories', {})
      })

      if (response.error) {
        throw new Error(response.error)
      }

      const accessories = response.accessories || []
      this.logger.debug(`Loaded ${accessories.length} Matter accessories from IPC`)

      // Transform to unified format with protocol marker
      const matterServices = accessories.flatMap((accessory: MatterAccessory) => {
        const services: MatterService[] = []

        // Main accessory
        services.push({
          ...this.transformMatterAccessory(accessory),
          protocol: 'matter',
        })

        // Parts (composed devices)
        if (accessory.parts) {
          for (const part of accessory.parts) {
            services.push({
              ...this.transformMatterAccessory(accessory, part),
              protocol: 'matter',
            })
          }
        }

        return services
      })

      this.logger.debug(`Transformed ${matterServices.length} Matter services (including parts)`)
      this.matterAccessories = matterServices
      return matterServices
    } catch (error) {
      this.logger.debug('Failed to load Matter accessories:', error)
      return []
    }
  }

  /**
   * Transform Matter accessory to unified service format
   */
  private transformMatterAccessory(accessory: MatterAccessory, part?: MatterAccessoryPart): MatterService {
    const targetClusters = part?.clusters || accessory.clusters
    const displayName = part
      ? `${accessory.displayName} - ${part.displayName}`
      : accessory.displayName
    const uniqueId = part
      ? `matter:${accessory.uuid}:${part.id}`
      : `matter:${accessory.uuid}`

    const deviceType = part?.deviceType || accessory.deviceType

    // Verify bridge.username is set for layout caching
    const bridgeUsername = accessory.bridge?.username || 'unknown'
    if (bridgeUsername === 'unknown') {
      this.logger.warn(`Matter accessory '${displayName}' (${uniqueId}) has no bridge.username - layout may not persist correctly`)
    }

    return {
      uniqueId,
      uuid: accessory.uuid,
      serviceName: displayName,
      displayName,
      deviceType,
      clusters: targetClusters,
      partId: part?.id,
      protocol: 'matter',
      instance: {
        name: accessory.bridge?.name || 'Matter Bridge',
        username: bridgeUsername,
      },
      accessoryInformation: {
        'Name': displayName,
        'Manufacturer': accessory.manufacturer || 'Unknown',
        'Model': accessory.model || deviceType,
        'Serial Number': accessory.serialNumber || accessory.uuid,
        'Firmware Revision': accessory.firmwareRevision || '1.0.0',
      },
      // Additional Matter info
      bridge: accessory.bridge,
      plugin: accessory.plugin,
      platform: accessory.platform,
      commissioned: accessory.commissioned,
      fabricCount: accessory.fabricCount,
      fabrics: accessory.fabrics,
      // Aid/iid placeholders (not used for Matter but required by some UI code)
      aid: 0,
      iid: 0,
    }
  }

  /**
   * Handle Matter state updates from IPC
   */
  private handleMatterStateUpdate(data: MatterStateUpdate): void {
    const uniqueId = this.buildMatterUniqueId(data.uuid, data.partId)

    const service = this.matterAccessories.find(s => s.uniqueId === uniqueId)
    if (!service) {
      return
    }

    // Update cluster state
    service.clusters[data.cluster] = {
      ...service.clusters[data.cluster],
      ...data.state,
    }

    // Notify all connected clients
    for (const client of this.activeClients) {
      client.emit('accessories-data', [service])
    }
  }

  /**
   * Handle Matter accessory control commands
   */
  private async handleMatterControl(client: Socket, control: {
    uniqueId: string
    cluster: string
    attributes: Record<string, unknown>
  }): Promise<void> {
    try {
      const { uuid, partId } = this.parseMatterUniqueId(control.uniqueId)

      // Find the accessory in the cache to get the bridge username
      const accessory = this.matterAccessories.find(acc => acc.uuid === uuid)
      const bridgeUsername = accessory?.bridge?.username

      // Send control command via IPC using unified Matter event channel
      const response = await this.waitForMatterEvent<MatterControlResponse>('accessoryControlResponse', () => {
        this.homebridgeIpcService.sendMessage('matterAccessoryControl', {
          uuid,
          cluster: control.cluster,
          attributes: control.attributes,
          bridgeUsername,
          partId,
        })
      })

      if (!response.success) {
        client.emit('accessory-control-failure', response.error || 'Matter control failed')
      }
    } catch (error) {
      this.logger.error('Matter control failed:', error)
      client.emit('accessory-control-failure', error.message || 'Matter control failed')
    }
  }
}
