import type { HapInstance, ServiceType } from '@homebridge/hap-client'
import type { Socket } from 'socket.io'

import type { AccessoryControlMessage } from './accessories.interfaces.js'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

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

interface HapAccessoriesPayload {
  accessories?: Array<{
    services?: Array<{
      characteristics?: Array<{
        description?: unknown
        value?: unknown
      }>
    }>
  }>
}

interface LocalHapProbe {
  host: string
  port: number
  accessoriesData: HapAccessoriesPayload
}

interface LocalHapCandidate {
  host?: string
  port: number
  username?: string
  name?: string
  source: string
}

interface StableHapServiceIdentity {
  uniqueId: string
  nameBasedUniqueId?: string
  localScan: boolean
}

@Injectable()
export class AccessoriesService {
  public hapClient: HapClient
  public accessoriesCache = new NodeCache({ stdTTL: 0 })

  private accessoryLoadChain: Promise<ServiceType[]> = Promise.resolve([])
  private lastKnownHapServices = new Map<string, ServiceType>()
  private stableHapServiceIdentities = new Map<string, StableHapServiceIdentity>()
  private lastLocalHapSeedAt = 0

  // Matter monitoring state
  private matterMonitoringActive = false
  private matterUpdateListener: ((event: MatterEvent) => void) | null = null
  // Cached promise for the one-shot Matter monitoring start. Concurrent
  // first-client connects all await the same promise so we only ever send
  // one startMatterMonitoring IPC per UI process lifetime. Cleared on
  // failure so a subsequent client can retry.
  private matterMonitoringStartPromise: Promise<void> | null = null
  private activeClients = new Set<Socket>()
  // Per-socket reload entry point. Lets a repeat `get-accessories` for an
  // already-connected socket re-fetch data instead of stacking a second set
  // of listeners/timers on top of the live session.
  private clientSessions = new Map<Socket, { reload: () => Promise<void> }>()
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

    // If this socket already has a live session, reload its data instead of
    // wiring up a second set of listeners/timers. A client that re-emits
    // `get-accessories` (e.g. a reconnect the server didn't observe as a
    // disconnect) would otherwise stack handlers on the shared hapClient and
    // characteristic monitor, multiplying the work done per update.
    // `activeClients` membership is the synchronous guard: it is set below
    // before the first `await`, so a racing repeat `get-accessories` still
    // short-circuits here.
    if (this.activeClients.has(client)) {
      await this.clientSessions.get(client)?.reload()
      return
    }

    // Track this client (synchronous — closes the race in the guard above)
    this.activeClients.add(client)

    let services: (ServiceType | MatterService)[]
    // Closure-scoped abort flag. `onEnd` flips this when the client
    // disconnects so any in-flight `loadAllAccessories` / control
    // requests can short-circuit at the next `await` boundary instead of
    // burning IPC + HAP work whose result has nowhere to go.
    let disconnected = false

    const loadAllAccessories = async (refresh: boolean) => {
      if (disconnected) {
        return
      }
      if (!refresh) {
        const cached = this.accessoriesCache.get<(ServiceType | MatterService)[]>('services')
        if (cached && cached.length) {
          client.emit('accessories-data', cached)
        }
      }

      // Load HAP accessories first
      const hapServices = await this.loadAccessories()
      if (disconnected) {
        return
      }
      this.refreshCharacteristics(hapServices)

      // Emit HAP ready immediately so HAP accessories can be controlled
      client.emit('hap-accessories-ready-for-control')
      client.emit('accessories-data', hapServices)

      // Load Matter accessories (maybe slower due to IPC)
      const matterServices = await this.loadMatterAccessories()
      if (disconnected) {
        return
      }

      // Emit Matter ready
      client.emit('matter-accessories-ready-for-control')
      if (matterServices.length > 0) {
        client.emit('accessories-data', matterServices)
      }

      // Merge both for caching and legacy compatibility
      services = [...hapServices, ...matterServices]
      this.accessoriesCache.set('services', services)
    }

    // Expose this session's reload so a repeat `get-accessories` for this same
    // socket re-fetches in place rather than re-registering listeners.
    this.clientSessions.set(client, { reload: () => loadAllAccessories(true) })

    // Ensure Matter monitoring is started (idempotent — one-shot per UI
    // process lifetime, shared across concurrent connects). Every client
    // awaits the same promise so loadMatterAccessories can rely on core's
    // monitoring being active by the time it runs, regardless of how many
    // clients have connected before.
    await this.ensureMatterMonitoringStarted()

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

    const updateHandler = (data: ServiceType) => {
      client.emit('accessories-data', this.normaliseHapServiceIdentity(data))
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
      disconnected = true
      clearTimeout(secondaryLoadTimeout)
      this.clientSessions.delete(client)
      client.removeAllListeners('end')
      client.removeAllListeners('disconnect')
      client.removeAllListeners('accessory-control')
      monitor.removeAllListeners('service-update')
      monitor.finish()
      this.hapClient.removeListener('instance-discovered', instanceUpdateHandler)

      // Remove client from active clients
      this.activeClients.delete(client)

      // Intentionally do NOT stop Matter monitoring on the last client
      // disconnect. The pre-fix behaviour started monitoring on first connect
      // and stopped on last disconnect, so every page reload cycled core's
      // Matter state and re-raced its init on the next start — producing
      // 'Matter monitoring not active' spam. Keep monitoring active for the
      // lifetime of the UI process; core's matterMonitoringClients counter
      // stays at >0 and the start-up race only ever happens once.
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
   * Access hap-client's discovered instance pool.
   *
   * hap-client does not currently expose public methods for adding a known
   * instance. Keep this reflection boundary in one place so the fallback can
   * be removed cleanly when such an API becomes available.
   */
  private getHapInstancePool(): HapInstance[] {
    const instances = Reflect.get(this.hapClient, 'instances')
    return Array.isArray(instances) ? instances as HapInstance[] : []
  }

  private setHapInstancePool(instances: HapInstance[]): void {
    Reflect.set(this.hapClient, 'instances', instances)
  }

  private isLocalScanInstance(instance?: Partial<HapInstance>): boolean {
    return String(instance?.username || '').toUpperCase().startsWith('LOCAL-SCAN:')
  }

  /**
   * Build an endpoint-independent identity for a HAP service.
   * It is only used to bridge identity changes involving LOCAL-SCAN instances.
   */
  private hapServiceIdentityKey(service: ServiceType): string | null {
    const information = service.accessoryInformation || {}
    const serial = String(information['Serial Number'] || '').trim().toLowerCase()
    const instanceUsername = String(service.instance?.username || '').trim().toLowerCase()
    const deviceIdentity = serial
      ? [
          serial,
          String(information.Manufacturer || '').trim().toLowerCase(),
          String(information.Model || '').trim().toLowerCase(),
        ].join('|')
      : instanceUsername

    if (!deviceIdentity || !service.type) {
      return null
    }

    return [
      deviceIdentity,
      String(service.serviceName || '').trim().toLowerCase(),
      service.aid,
      service.iid,
      service.type,
    ].join('|')
  }

  private normaliseHapServiceIdentity(service: ServiceType): ServiceType {
    if (!service?.uniqueId) {
      return service
    }

    const key = this.hapServiceIdentityKey(service)
    if (!key) {
      return service
    }

    const localScan = this.isLocalScanInstance(service.instance)
    const stable = this.stableHapServiceIdentities.get(key)
    if (!stable) {
      this.stableHapServiceIdentities.set(key, {
        uniqueId: service.uniqueId,
        nameBasedUniqueId: service.nameBasedUniqueId,
        localScan,
      })
      return service
    }

    // Avoid correlating two regular HAP instances that happen to expose the
    // same non-unique AccessoryInformation values.
    if (!stable.localScan && !localScan) {
      return service
    }

    service.uniqueId = stable.uniqueId
    if (stable.nameBasedUniqueId) {
      service.nameBasedUniqueId = stable.nameBasedUniqueId
    }
    if (localScan) {
      stable.localScan = true
    }
    return service
  }

  /**
   * Merge partial snapshots without dropping services returned by an earlier
   * successful load. Incoming services always replace their previous object.
   */
  private mergeHapSnapshot(hapServices: ServiceType[]): ServiceType[] {
    const previousCount = this.lastKnownHapServices.size
    if (!hapServices.length && previousCount) {
      this.logger.warn(
        `Ignoring empty HAP accessory snapshot; keeping ${previousCount} previously known HAP services.`,
      )
      return [...this.lastKnownHapServices.values()]
    }

    const previousInstances = new Set(
      [...this.lastKnownHapServices.values()]
        .map(service => service.instance?.username)
        .filter(Boolean),
    )
    const currentInstances = new Set(
      hapServices
        .map(service => service.instance?.username)
        .filter(Boolean),
    )
    const missingInstances = [...previousInstances]
      .filter(username => !currentInstances.has(username))
    const currentServices = new Map<string, ServiceType>()

    for (const incoming of hapServices) {
      const service = this.normaliseHapServiceIdentity(incoming)
      if (service.uniqueId) {
        currentServices.set(service.uniqueId, service)
      }
    }

    // When every previously known instance responded, this is a complete
    // snapshot and can safely replace the cache (including real removals).
    if (!missingInstances.length) {
      this.lastKnownHapServices = currentServices
      return [...currentServices.values()]
    }

    for (const [uniqueId, service] of currentServices) {
      this.lastKnownHapServices.set(uniqueId, service)
    }
    const merged = [...this.lastKnownHapServices.values()]
    this.logger.warn(
      `HAP accessory snapshot looks partial: received ${hapServices.length}, `
      + `keeping ${merged.length} previously known service(s). Missing instances: `
      + `${missingInstances.join(', ')}.`,
    )
    return merged
  }

  /**
   * Keep the first instance for a username or endpoint. This makes a validated
   * LOCAL-SCAN instance sticky if mDNS later reports the same endpoint.
   */
  private dedupeHapInstancePool(): number {
    const instances = this.getHapInstancePool()
    const usernames = new Set<string>()
    const endpoints = new Set<string>()
    const deduped: HapInstance[] = []

    for (const instance of instances) {
      const username = String(instance?.username || '').trim().toLowerCase()
      const rawHost = String(instance?.ipAddress || '').trim().toLowerCase()
      const host = rawHost === 'localhost' ? '127.0.0.1' : rawHost
      const port = Number(instance?.port)
      const endpoint = host && Number.isInteger(port) ? `${host}:${port}` : ''

      if (
        (username && usernames.has(username))
        || (endpoint && endpoints.has(endpoint))
      ) {
        continue
      }

      if (username) {
        usernames.add(username)
      }
      if (endpoint) {
        endpoints.add(endpoint)
      }
      deduped.push(instance)
    }

    this.setHapInstancePool(deduped)
    return instances.length - deduped.length
  }

  private async fetchWithTimeout(url: string, options: Parameters<typeof fetch>[1] = {}): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1000)
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Verify that a local listener exposes HAP and accepts this bridge's PIN.
   */
  private async probeLocalHapPort(port: number, pin: string): Promise<LocalHapProbe | null> {
    for (const host of ['127.0.0.1', 'localhost']) {
      try {
        const accessoriesResponse = await this.fetchWithTimeout(`http://${host}:${port}/accessories`)
        if (!accessoriesResponse.ok) {
          continue
        }

        const accessoriesData = await accessoriesResponse.json().catch(() => null) as HapAccessoriesPayload | null
        if (!Array.isArray(accessoriesData?.accessories)) {
          continue
        }

        const checkResponse = await this.fetchWithTimeout(`http://${host}:${port}/characteristics`, {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            'authorization': pin,
          },
          body: JSON.stringify({
            characteristics: [{ aid: -1, iid: -1 }],
          }),
        })
        if (![200, 204, 207].includes(checkResponse.status)) {
          continue
        }

        return {
          host,
          port,
          accessoriesData,
        }
      } catch {
        // Not a reachable and authorised HAP endpoint.
      }
    }
    return null
  }

  /**
   * Derive a stable synthetic username from public HAP AccessoryInformation.
   */
  private describeLocalHapEndpoint(probe: LocalHapProbe): {
    key: string
    username: string
    name: string
  } | null {
    for (const accessory of probe.accessoriesData.accessories || []) {
      const information = new Map<string, string>()
      for (const service of accessory.services || []) {
        for (const characteristic of service.characteristics || []) {
          const description = String(characteristic.description || '').trim().toLowerCase()
          if (
            !['name', 'serial number', 'manufacturer', 'model'].includes(description)
            || information.has(description)
          ) {
            continue
          }
          const value = String(characteristic.value || '').trim()
          if (value) {
            information.set(description, value)
          }
        }
      }

      const name = information.get('name') || ''
      const identity = [
        information.get('serial number') || '',
        name,
        information.get('manufacturer') || '',
        information.get('model') || '',
      ]
        .map(value => value.trim().toLowerCase())
        .join('|')
      if (!identity.replaceAll('|', '')) {
        continue
      }

      // FNV-1a provides a short deterministic identifier; this is not used
      // for security, only to avoid embedding accessory details in usernames.
      let hash = 2166136261
      for (const character of identity) {
        hash ^= character.codePointAt(0) || 0
        hash = Math.imul(hash, 16777619)
      }

      return {
        key: `scan:${identity}`,
        username: `LOCAL-SCAN:${(hash >>> 0).toString(16).padStart(8, '0').toUpperCase()}`,
        name: name || `Local HAP ${probe.port}`,
      }
    }
    return null
  }

  private async parseProcNetTcp(path: string): Promise<number[]> {
    try {
      const text = await readFile(path, 'utf8')
      const ports: number[] = []
      for (const line of text.split('\n').slice(1)) {
        const columns = line.trim().split(/\s+/)
        if (columns.length < 4 || columns[3] !== '0A') {
          continue
        }
        const port = Number.parseInt(columns[1].split(':').pop(), 16)
        if (Number.isInteger(port) && port > 0 && port <= 65535) {
          ports.push(port)
        }
      }
      return [...new Set(ports)]
    } catch {
      return []
    }
  }

  /**
   * Add configured local bridges and verified undiscovered local HAP
   * listeners to hap-client's instance pool.
   */
  private async seedLocalHapInstances(): Promise<void> {
    if (process.env.HB_UI_ACCESSORIES_LOCAL_SEED === '0') {
      return
    }

    const now = Date.now()
    const configuredInterval = Number(process.env.HB_UI_ACCESSORIES_LOCAL_SEED_INTERVAL_MS)
    const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 0
      ? configuredInterval
      : 30000
    if (this.lastLocalHapSeedAt && now - this.lastLocalHapSeedAt < intervalMs) {
      this.dedupeHapInstancePool()
      return
    }
    this.lastLocalHapSeedAt = now

    const config = this.configService.homebridgeConfig
    const pin = config.bridge?.pin
    if (!pin) {
      this.logger.warn('No Homebridge bridge pin found; skipping local HAP instance fallback.')
      return
    }

    const candidates = new Map<string, LocalHapCandidate>()
    const normaliseUsername = (value: unknown): string => {
      const username = String(value || '').trim()
      return /^(?:[a-f\d]{2}:){5}[a-f\d]{2}$/i.test(username)
        ? username.toUpperCase()
        : username
    }
    const addBridgeCandidate = (
      bridge: { port?: unknown, username?: unknown, name?: unknown } | undefined,
      source: string,
    ) => {
      if (!bridge) {
        return
      }
      const port = Number(bridge.port)
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        return
      }
      const username = normaliseUsername(bridge.username)
      candidates.set(`bridge:${username.toLowerCase() || port}`, {
        port,
        username,
        name: bridge.name ? String(bridge.name) : undefined,
        source,
      })
    }

    addBridgeCandidate(config.bridge, 'config.bridge')
    for (const platform of config.platforms || []) {
      addBridgeCandidate(platform._bridge, 'platform._bridge')
    }
    for (const accessory of config.accessories || []) {
      addBridgeCandidate(accessory._bridge, 'accessory._bridge')
    }

    this.dedupeHapInstancePool()
    const currentInstances = this.getHapInstancePool()

    // Validate existing synthetic instances first. Their identity keys reserve
    // the device so another concurrently listening port cannot replace them.
    for (const instance of currentInstances) {
      if (!this.isLocalScanInstance(instance)) {
        continue
      }
      const probe = await this.probeLocalHapPort(Number(instance.port), pin)
      const description = probe && this.describeLocalHapEndpoint(probe)
      if (probe && description) {
        candidates.set(description.key, {
          host: probe.host,
          port: Number(instance.port),
          username: instance.username,
          name: description.name,
          source: 'existing-local-scan',
        })
      }
    }

    if (process.env.HB_UI_ACCESSORIES_LOCAL_SCAN !== '0') {
      const scanPorts = new Set([
        ...await this.parseProcNetTcp('/proc/net/tcp'),
        ...await this.parseProcNetTcp('/proc/net/tcp6'),
      ])
      const unknownPorts = [...scanPorts].filter(port => (
        port !== 8581
        && ![...candidates.values()].some(candidate => candidate.port === port)
        && !currentInstances.some(instance => instance.port === port)
      ))

      // Probe in small batches to cap both latency and concurrent local I/O.
      for (let index = 0; index < unknownPorts.length; index += 8) {
        const batch = unknownPorts.slice(index, index + 8)
        const probes = await Promise.all(batch.map(port => this.probeLocalHapPort(port, pin)))
        for (const probe of probes) {
          if (!probe) {
            continue
          }
          const description = this.describeLocalHapEndpoint(probe)
          if (!description || candidates.has(description.key)) {
            continue
          }
          candidates.set(description.key, {
            host: probe.host,
            port: probe.port,
            username: description.username,
            name: description.name,
            source: '/proc/net/tcp,hap-scan',
          })
        }
      }
    }

    const instances = this.getHapInstancePool()
    this.setHapInstancePool(instances)
    const seeded: string[] = []
    const updated: string[] = []

    for (const candidate of candidates.values()) {
      const username = String(candidate.username || '')
      const existingByUsername = username
        ? instances.find(instance => instance.username.toLowerCase() === username.toLowerCase())
        : undefined

      if (existingByUsername) {
        if (existingByUsername.port !== candidate.port) {
          const probe = candidate.host
            ? { host: candidate.host }
            : await this.probeLocalHapPort(candidate.port, pin)
          if (probe) {
            existingByUsername.ipAddress = probe.host
            existingByUsername.port = candidate.port
            existingByUsername.name = candidate.name || existingByUsername.name
            existingByUsername.connectionFailedCount = 0
            updated.push(
              `${existingByUsername.name} (${existingByUsername.username}) -> `
              + `${probe.host}:${candidate.port} [${candidate.source}]`,
            )
          }
        }
        continue
      }

      if (instances.some(instance => instance.port === candidate.port)) {
        continue
      }

      const probe = candidate.host
        ? { host: candidate.host }
        : await this.probeLocalHapPort(candidate.port, pin)
      if (!probe) {
        continue
      }

      const instance: HapInstance = {
        name: candidate.name || `Local HAP ${candidate.port}`,
        username: username || `LOCAL-CONFIG:${candidate.port}`,
        ipAddress: probe.host,
        port: candidate.port,
        services: [],
        connectionFailedCount: 0,
        configurationNumber: 0,
      }
      instances.push(instance)
      seeded.push(
        `${instance.name} (${instance.username}) @ `
        + `${probe.host}:${candidate.port} [${candidate.source}]`,
      )
      this.hapClient.emit('instance-discovered', instance)
    }

    const dedupedCount = this.dedupeHapInstancePool()
    if (seeded.length || updated.length || dedupedCount) {
      this.logger.warn(
        `Local HAP fallback: seeded ${seeded.length}, updated ${updated.length}, `
        + `deduplicated ${dedupedCount} instance(s): `
        + `${[...seeded, ...updated].join('; ') || 'no new endpoints'}`,
      )
    }
  }

  /**
   * Load all the accessories from Homebridge
   */
  public async loadAccessories(): Promise<ServiceType[]> {
    if (!this.configService.homebridgeInsecureMode) {
      throw new BadRequestException('Homebridge must be running in insecure mode to access accessories.')
    }

    const run = async (): Promise<ServiceType[]> => {
      try {
        await this.seedLocalHapInstances()
        const hapServices = await this.hapClient.getAllServices()
        return this.mergeHapSnapshot(hapServices)
      } catch (e) {
        if (e.response?.status === 401) {
          this.logger.warn('Homebridge must be running in insecure mode to view and control accessories from this plugin.')
        } else {
          this.logger.error(`Failed to load accessories from Homebridge as ${e.message}.`)
        }
        return this.mergeHapSnapshot([])
      }
    }

    this.accessoryLoadChain = this.accessoryLoadChain
      .catch((error) => {
        this.logger.warn(`Previous accessory load failed: ${error?.message || error}`)
        return []
      })
      .then(run)
    return await this.accessoryLoadChain
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
   * Idempotently start Matter monitoring for the lifetime of this UI process.
   *
   * The actual start is one-shot: concurrent first-client connects all share
   * the same cached promise so we only send one `startMatterMonitoring` IPC
   * regardless of how many sockets arrive. If the start fails the cached
   * promise is cleared so a later client connect can retry — a transient
   * core-side hiccup shouldn't leave Matter monitoring permanently inactive
   * until the UI process restarts.
   */
  private async ensureMatterMonitoringStarted(): Promise<void> {
    if (this.matterMonitoringActive) {
      return
    }
    if (!this.matterMonitoringStartPromise) {
      const attempt = this.startMatterMonitoring().catch((error) => {
        this.logger.error('Failed to start Matter monitoring:', error)
        if (this.matterMonitoringStartPromise === attempt) {
          this.matterMonitoringStartPromise = null
        }
      })
      this.matterMonitoringStartPromise = attempt
    }
    return this.matterMonitoringStartPromise
  }

  /**
   * Start Matter monitoring via IPC.
   *
   * Gates the first `getMatterAccessories` on core's `monitoringStarted` ack
   * so we don't race core's Matter init (which would log
   * 'Matter monitoring not active'). The ack arrives via the shared
   * matterEvent dispatcher, which only routes events that echo back the
   * request's correlationId — so the wait is feature-flagged: against an
   * older Homebridge that doesn't echo, we fall back to flipping the active
   * flag synchronously (the pre-ack behaviour) rather than hanging on a
   * reply that will never be delivered.
   */
  private async startMatterMonitoring(): Promise<void> {
    // Skip if the running Homebridge version pre-dates Matter, or if the user
    // hasn't turned Matter on for any bridge. Without the latter check we'd
    // still fire startMatterMonitoring + getMatterAccessories every time the
    // accessories tab loads, producing timeout/retry/failed log spam.
    const featureFlags = this.configService.getFeatureFlags()
    if (!featureFlags.matterSupport || !this.configService.isMatterEnabled()) {
      return
    }

    this.logger.debug('Starting Matter accessory monitoring')

    // Install the matter event listener BEFORE sending the start request so
    // we don't miss any server-pushed accessoryUpdate/Added/Removed events
    // that core may emit immediately after monitoring becomes active. The
    // correlation-id dispatcher (which handles request/response events like
    // accessoriesData and the monitoring acks) is installed lazily by
    // waitForMatterEvent and runs alongside this listener on the same channel.
    const listener: (event: MatterEvent) => void = (event) => {
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
    this.matterUpdateListener = listener
    this.homebridgeIpcService.on('matterEvent', listener)

    try {
      if (featureFlags.matterMonitoringAck) {
        // Send with a correlationId and await core's ack before flipping the
        // flag — this is what closes the startup race.
        await this.waitForMatterEvent('monitoringStarted', (correlationId) => {
          this.homebridgeIpcService.sendMessage('startMatterMonitoring', { correlationId })
        })
      } else {
        // Older Homebridge doesn't echo correlationId on the ack, so the
        // dispatcher would drop it. Fall back to fire-and-forget and accept
        // the small startup-race window the ack would otherwise close.
        this.homebridgeIpcService.sendMessage('startMatterMonitoring')
      }

      this.matterMonitoringActive = true
      this.logger.debug('Matter monitoring started successfully')
    } catch (error) {
      // Tear the listener back down so a retry from ensureMatterMonitoringStarted
      // doesn't end up with two listeners attached for accessory updates.
      this.homebridgeIpcService.removeListener('matterEvent', listener)
      if (this.matterUpdateListener === listener) {
        this.matterUpdateListener = null
      }
      throw error
    }
  }

  /**
   * Load Matter accessories via IPC
   */
  private async loadMatterAccessories(): Promise<MatterService[]> {
    const featureFlags = this.configService.getFeatureFlags()
    if (!featureFlags.matterSupport || !this.configService.isMatterEnabled()) {
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
