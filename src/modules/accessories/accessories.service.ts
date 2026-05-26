import type { ServiceType } from '@homebridge/hap-client'
import type { Socket } from 'socket.io'

import type { AccessoryControlMessage } from './accessories.interfaces.js'

import { join } from 'node:path'

import { HapClient } from '@homebridge/hap-client'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { mkdirp, pathExists, readJson } from 'fs-extra/esm'
import NodeCache from 'node-cache'

import { ConfigService } from '../../core/config/config.service.js'
import { JsonFileStoreService } from '../../core/fs/json-file-store.service.js'
import { HomebridgeIpcService } from '../../core/homebridge-ipc/homebridge-ipc.service.js'
import { Logger } from '../../core/logger/logger.service.js'
import {
  MatterAccessoriesResponse,
  MatterAccessory,
  MatterAccessoryInfo,
  MatterAccessoryPart,
  MatterControlResponse,
  MatterEvent,
  MatterService,
  MatterStateUpdate,
} from '../../core/matter/matter.interfaces.js'

@Injectable()
export class AccessoriesService {
  public hapClient: HapClient
  public accessoriesCache = new NodeCache({ stdTTL: 0 })

  // Matter monitoring state
  private matterMonitoringActive = false
  private matterUpdateListener: ((event: MatterEvent) => void) | null = null
  private activeClients = new Set<Socket>()
  private matterAccessories: MatterService[] = []
  // Single shared dispatcher for `matterEvent` IPC replies. Each in-flight
  // request stores `{ eventType, resolve, reject, timer }` keyed by its
  // correlation id; the dispatcher routes incoming events to the right
  // waiter instead of every request registering its own listener.
  private matterRequests = new Map<string, { eventType: string, resolve: (v: any) => void, reject: (e: Error) => void, timer: ReturnType<typeof setTimeout> }>()
  private matterDispatcherInstalled = false

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(Logger) private readonly logger: Logger,
    @Inject(HomebridgeIpcService) private readonly homebridgeIpcService: HomebridgeIpcService,
    @Inject(JsonFileStoreService) private readonly jsonStore: JsonFileStoreService,
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

      // Load Matter accessories (maybe slower due to IPC)
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
      const response = await this.waitForMatterEvent<MatterAccessoryInfo>('accessoryInfo', (correlationId) => {
        this.homebridgeIpcService.sendMessage('getMatterAccessoryInfo', { uuid, correlationId })
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
          isDefault: true,
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
    // Ensure the accessories dir exists for the first-ever save before
    // we acquire the file lock — pathExists/mkdirp don't touch the
    // accessory-layout.json itself.
    if (!await pathExists(join(this.configService.storagePath, 'accessories'))) {
      await mkdirp(join(this.configService.storagePath, 'accessories'))
    }

    // Per-path mutex on accessory-layout.json so two near-simultaneous
    // save-layout socket events don't both read the same baseline and
    // drop one user's update on top of the other's.
    await this.jsonStore.mutate<Record<string, unknown>>(
      this.configService.accessoryLayoutPath,
      (current) => {
        const accessoryLayout = current ?? {}
        accessoryLayout[user] = layout
        return accessoryLayout
      },
    )
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
   * Matter events use a unified 'matterEvent' channel with different types.
   * Uses a correlationId to avoid cross-talk between concurrent requests.
   * Retries once on timeout (10s per attempt).
   */
  private async waitForMatterEvent<T = unknown>(eventType: string, sendRequest: (correlationId: string) => void): Promise<T> {
    try {
      return await this.attemptMatterEvent<T>(eventType, sendRequest, 10000)
    } catch {
      this.logger.warn(`Matter IPC request '${eventType}' timed out, retrying...`)
      try {
        return await this.attemptMatterEvent<T>(eventType, sendRequest, 10000)
      } catch (retryError) {
        this.logger.error(`Matter IPC request '${eventType}' failed after retry`)
        throw retryError
      }
    }
  }

  /**
   * Single attempt to wait for a Matter event with the given timeout.
   * Each request gets a correlation id and parks `{ resolve, reject }` in
   * `matterRequests`; the shared dispatcher (installed on first use)
   * routes incoming `matterEvent`s to the right waiter. Pre-fix this
   * registered a fresh listener per request, so N concurrent requests
   * meant N listeners and each emit did O(N) work.
   */
  private async attemptMatterEvent<T = unknown>(eventType: string, sendRequest: (correlationId: string) => void, timeoutMs: number): Promise<T> {
    this.ensureMatterDispatcher()
    const correlationId = `${eventType}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.matterRequests.delete(correlationId)) {
          reject(new Error('The Homebridge service did not respond'))
        }
      }, timeoutMs)

      this.matterRequests.set(correlationId, {
        eventType,
        resolve,
        reject,
        timer,
      })

      try {
        sendRequest(correlationId)
      } catch (e) {
        if (this.matterRequests.delete(correlationId)) {
          clearTimeout(timer)
          reject(e)
        }
      }
    })
  }

  /**
   * Install the single `matterEvent` listener on first use. Routes each
   * incoming event to the waiter parked under its correlation id.
   * Events whose correlation id is unknown (or whose `eventType` doesn't
   * match the parked request's expectation) are dropped — matches the
   * pre-fix per-listener filter behaviour.
   */
  private ensureMatterDispatcher(): void {
    if (this.matterDispatcherInstalled) {
      return
    }
    this.matterDispatcherInstalled = true
    this.homebridgeIpcService.on('matterEvent', (event: MatterEvent) => {
      if (!event?.correlationId) {
        return
      }
      const waiter = this.matterRequests.get(event.correlationId)
      if (!waiter) {
        return
      }
      if (event.type !== waiter.eventType) {
        return
      }
      this.matterRequests.delete(event.correlationId)
      clearTimeout(waiter.timer)
      waiter.resolve(event.data)
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
            this.handleMatterStateUpdate(event.data)
            break

          case 'accessoryAdded':
          case 'accessoryRemoved':
            this.logger.debug(`Matter accessory ${event.type}: ${event.data.uuid} - triggering reload`)
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
      const response = await this.waitForMatterEvent<MatterAccessoriesResponse>('accessoriesData', (correlationId) => {
        this.homebridgeIpcService.sendMessage('getMatterAccessories', { correlationId })
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

      // Apply instanceBlacklist filtering to Matter accessories
      const blacklist = this.configService.ui.accessoryControl?.instanceBlacklist || []
      const filteredServices = blacklist.length > 0
        ? matterServices.filter((s) => {
            if (blacklist.some(b => s.instance.username.toLowerCase() === b.toLowerCase())) {
              this.logger.debug(`Matter accessory '${s.displayName}' filtered by instanceBlacklist (bridge: ${s.instance.username})`)
              return false
            }
            return true
          })
        : matterServices

      this.logger.debug(`${filteredServices.length} Matter services after blacklist filtering`)
      this.matterAccessories = filteredServices
      return filteredServices
    } catch (error) {
      this.logger.warn('Failed to load Matter accessories:', error)
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
    const uniqueId = this.buildMatterUniqueId(accessory.uuid, part?.id)

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
      const response = await this.waitForMatterEvent<MatterControlResponse>('accessoryControlResponse', (correlationId) => {
        this.homebridgeIpcService.sendMessage('matterAccessoryControl', {
          uuid,
          cluster: control.cluster,
          attributes: control.attributes,
          bridgeUsername,
          partId,
          correlationId,
        })
      })

      if (!response.success) {
        client.emit('accessory-control-failure', response.error || 'Matter control failed')
        return
      }

      // Update local cluster state and notify all clients, mirroring handleMatterStateUpdate
      if (accessory?.clusters?.[control.cluster]) {
        accessory.clusters[control.cluster] = {
          ...accessory.clusters[control.cluster],
          ...control.attributes,
        }

        for (const c of this.activeClients) {
          c.emit('accessories-data', [accessory])
        }
      }
    } catch (error) {
      this.logger.error('Matter control failed:', error)
      client.emit('accessory-control-failure', error.message || 'Matter control failed')
    }
  }
}
