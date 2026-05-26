import type { ServiceType } from '@homebridge/hap-client'

import { createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, Injectable, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Subject } from 'rxjs'
import { takeUntil } from 'rxjs/operators'

import { AccessoryLayout, AccessoryLayoutService, ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoryInfoComponent } from '@/app/core/accessories/accessory-info/accessory-info.component'
import { AuthService } from '@/app/core/auth/auth.service'
import { CachedAccessoriesCacheService } from '@/app/core/caching/cached-accessories-cache.service'
import { ServerPairingsCacheService } from '@/app/core/caching/server-pairings-cache.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ACCESSORY_INFO_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'

@Injectable({
  providedIn: 'root',
})
export class AccessoriesService {
  private injector = inject(EnvironmentInjector)
  private $accessoryCache = inject(CachedAccessoriesCacheService)
  private $pairingsCache = inject(ServerPairingsCacheService)
  private $auth = inject(AuthService)
  private $destroyRef = inject(DestroyRef)
  private $errors = inject(HttpErrorService)
  private $modal = inject(NgbModal)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private accessoryCache: any[] = []
  private pairingCache: any[] = []
  private customAttributesApplied = new Set<string>()
  private combinedServiceIds = new Set<string>()
  private io!: IoNamespace
  private stop$ = new Subject<void>()
  // True between `start()` and `stop()`. Guards the `accessories-data` handler
  // so an in-flight payload landing after a session stops can't push stale
  // services to subscribers.
  private sessionActive = false
  private hiddenTypes = new Set([
    'InputSource',
    'LockManagement',
    'CameraRTPStreamManagement',
    'ProtocolInformation',
    'NFCAccess',
    'BridgedNode',
  ])

  public layoutSaved = new Subject()
  public accessoryData = new Subject()
  public hapReadyForControl = false
  public matterReadyForControl = false
  public accessories: { services: ServiceType[] } = { services: [] }
  public accessoryLayout!: AccessoryLayout
  private originalLayout!: AccessoryLayout
  public readonly availableBridges = signal<string[]>([])
  public readonly selectedBridges = signal<string[] | null>(null)
  public bridgeUsernameToNameMap: Map<string, string> = new Map()
  public readonly rooms = signal<Array<{
    name: string
    isDefault?: boolean
    services: ServiceTypeX[]
  }>>([])

  constructor() {
    if (this.$auth.user.admin) {
      void this.loadCachedData()
    }
  }

  private async loadCachedData(): Promise<void> {
    try {
      this.accessoryCache = await this.$accessoryCache.getHap()
    } catch (error) {
      console.error(error)
    }

    try {
      this.pairingCache = await this.$pairingsCache.get()
    } catch (error) {
      console.error(error)
    }
  }

  public async showAccessoryInformation(service: ServiceTypeX): Promise<boolean> {
    const injector = createEnvironmentInjector([{
      provide: ACCESSORY_INFO_MODAL_DATA,
      useValue: {
        service,
        accessoryCache: this.accessoryCache,
        pairingCache: this.pairingCache,
      },
    }], this.injector)

    const ref = this.$modal.open(AccessoryInfoComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const result = await ref.result

      // Apply saved values to the current service object in the room
      // The original service reference may have been replaced by an accessories-data
      // event during the modal close animation, so find the current one by uniqueId
      const currentService = this.rooms()
        .flatMap(r => r.services)
        .find(s => s.uniqueId === service.uniqueId) as ServiceTypeX | undefined

      const target = currentService || service
      target.customName = result.customName
      target.customType = result.customType
      target.hidden = result.hidden
      target.onDashboard = result.onDashboard

      this.saveLayout()
      // Trigger rooms signal update so OnPush components re-render
      this.rooms.update(rooms => [...rooms])
    } catch {
      // Modal dismissed - do not save
    }

    return false
  }

  /**
   * Stop the accessory control session
   */
  public stop() {
    // Complete all subscriptions
    this.stop$.next()
    this.stop$.complete()

    // Mark the session inactive so any in-flight `accessories-data` event that
    // lands between `io.end()` and the socket actually closing is dropped
    // instead of pushing stale services to subscribers.
    //
    // The public `accessoryData`/`layoutSaved` Subjects are deliberately NOT
    // completed/reassigned here. This service is a root singleton and its
    // consumers (accessories page, control modal, dashboard widget) subscribe
    // once via `takeUntilDestroyed` and never re-subscribe. Completing the
    // Subjects on stop killed those subscriptions on the first
    // `accessories-reload-required` reload, so a late-discovered bridge was
    // sorted into the rooms but never re-added to the bridge filter — hiding
    // the whole bridge until a manual page refresh.
    this.sessionActive = false

    this.io?.end?.()
    this.rooms.set([])
    this.accessories = { services: [] }
    this.customAttributesApplied.clear()
    this.combinedServiceIds.clear()
    this.accessoryLayout = undefined as any
    this.originalLayout = undefined as any

    // Reset the internal unsubscribe channel for the next session. The public
    // Subjects persist for the lifetime of this singleton service.
    this.stop$ = new Subject<void>()
  }

  /**
   * Start the accessory control session
   */
  public async start() {
    this.hapReadyForControl = false
    this.matterReadyForControl = false
    this.sessionActive = true

    // Connect to the socket endpoint
    this.io = this.$ws.connectToNamespace('accessories')

    // Load the room layout first
    await this.loadLayout()

    // Subscribe for reconnections — ReplaySubject(1) on `connected` ensures this
    // fires both for fresh connections and when the namespace is reused while
    // already connected, so no synchronous fallback is needed.
    this.io.connected!
      .pipe(takeUntil(this.stop$))
      .subscribe(() => {
        this.io.socket.emit('get-accessories')
      })

    // Subscribe to accessory events
    this.io.socket.on('accessories-data', (data: ServiceType[]) => {
      // Drop events that arrive after the session was stopped (e.g. an
      // in-flight payload landing between `stop()` and the socket closing).
      if (!this.sessionActive) {
        return
      }
      this.parseServices(data)
      this.combineRelatedServices()
      this.generateHelpers()
      this.sortIntoRooms()

      // Always order rooms to handle accessories that arrive late (e.g., Matter accessories)
      this.orderRooms()

      // In zoneless Angular, mutating service objects doesn't trigger change detection
      // We need to create new object references for the rooms signal to detect changes
      this.refreshRoomsForChangeDetection()

      // Apply custom attributes after refreshing room references
      // This ensures attributes are applied to the new service objects, not the old ones
      this.applyCustomAttributes()

      this.accessoryData.next(data)
    })

    // When a new instance is discovered, reload accessory data over the
    // existing socket instead of tearing the session down and back up.
    // A full stop()/start() re-binds every socket handler on the cached
    // socket (the previous handlers are never removed), so each reload
    // doubled the live listeners — and because each fired another reload, the
    // count grew with every late-discovered bridge. Re-fetching in place keeps
    // the single set of handlers; parseServices() merges the new bridge in.
    this.io.socket.on('accessories-reload-required', () => {
      this.io.socket.emit('accessory-control', { refresh: true })
    })

    // When only Matter accessories need to reload
    this.io.socket.on('matter-accessories-reload-required', async () => {
      // Trigger reload by emitting accessory-control-refresh
      // This will reload accessories from the backend without full reconnection
      this.matterReadyForControl = false
      this.io.socket.emit('accessory-control', { refresh: true })
    })

    this.io.socket.on('accessory-control-failure', (message: string) => {
      console.error(message)
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
    })

    // Protocol-specific ready events
    this.io.socket.on('hap-accessories-ready-for-control', () => {
      this.hapReadyForControl = true
    })

    this.io.socket.on('matter-accessories-ready-for-control', () => {
      this.matterReadyForControl = true
    })
  }

  /**
   * Save the room layout
   */
  public saveLayout() {
    // Generate layout schema from currently active rooms
    const currentLayout = this.rooms().map(room => ({
      name: room.name,
      isDefault: room.isDefault,
      services: room.services.map(service => ({
        uniqueId: service.uniqueId,
        nameBasedUniqueId: service.nameBasedUniqueId || undefined,
        name: service.serviceName,
        serial: service.accessoryInformation?.['Serial Number'],
        bridge: service.instance?.username,
        aid: service.aid,
        iid: service.iid,
        uuid: service.uuid,
        customName: (service as ServiceTypeX).customName || undefined,
        customType: (service as ServiceTypeX).customType || undefined,
        hidden: (service as ServiceTypeX).hidden || undefined,
        onDashboard: (service as ServiceTypeX).onDashboard || undefined,
      })),
    }))

    // Ensure at least one room has isDefault: true
    const hasDefaultRoom = currentLayout.some(r => r.isDefault === true)
    if (!hasDefaultRoom && currentLayout.length > 0) {
      currentLayout[0].isDefault = true
    }

    // Merge with undiscovered services from original layout to preserve custom information
    // This will add back rooms that exist in the original layout even if they have no discovered services
    this.accessoryLayout = this.mergeWithUndiscoveredServices(currentLayout as AccessoryLayout)

    // Send update request to server
    this.io.request('save-layout', { user: this.$auth.user.username, layout: this.accessoryLayout })
      .pipe(
        takeUntil(this.stop$),
        takeUntilDestroyed(this.$destroyRef),
      )
      .subscribe({
        next: () => this.layoutSaved.next(undefined),
        error: (error) => {
          console.error(error)
          this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
        },
      })
  }

  /**
   * Load the room layout
   */
  private async loadLayout() {
    this.accessoryLayout = await firstValueFrom(this.io.request('get-layout', { user: this.$auth.user.username }))

    // Store original layout to preserve undiscovered services
    this.originalLayout = JSON.parse(JSON.stringify(this.accessoryLayout))

    // Backward compatibility: Ensure at least one room has isDefault flag
    const hasDefaultRoom = this.accessoryLayout.some(r => r.isDefault)
    if (!hasDefaultRoom && this.accessoryLayout.length > 0) {
      // Find room named "Default Room" or use first room
      const defaultRoomIndex = this.accessoryLayout.findIndex(r => r.name === 'Default Room')
      const indexToMakeDefault = defaultRoomIndex !== -1 ? defaultRoomIndex : 0
      this.accessoryLayout[indexToMakeDefault].isDefault = true
    }

    // Build empty room layout
    this.rooms.set(this.accessoryLayout.map(room => ({
      name: room.name,
      isDefault: room.isDefault,
      services: [] as ServiceTypeX[],
    })))
  }

  /**
   * Check if a cached service matches a discovered service.
   *
   * Matching priority:
   * 1. nameBasedUniqueId (stable across sessions, available from hap-client)
   * 2. uniqueId (stable within a session, may change between sessions)
   * 3. Fallback: name + serial + bridge + uuid (legacy layouts without nameBasedUniqueId)
   *
   * Matter accessories use uniqueId + bridge matching only.
   */
  private servicesMatch(cachedService: AccessoryLayoutService, discoveredService: any): boolean {
    const isMatterAccessory = discoveredService.protocol === 'matter' || discoveredService.uniqueId?.startsWith('matter:')
    if (isMatterAccessory) {
      return cachedService.uniqueId === discoveredService.uniqueId
        && cachedService.bridge === (discoveredService.instance?.username || discoveredService.bridge)
    }

    // Primary match: nameBasedUniqueId (stable across sessions)
    if (cachedService.nameBasedUniqueId && discoveredService.nameBasedUniqueId) {
      return cachedService.nameBasedUniqueId === discoveredService.nameBasedUniqueId
    }

    // Secondary match: uniqueId
    if (cachedService.uniqueId === discoveredService.uniqueId) {
      return true
    }

    // Fallback: multi-field match for legacy layouts without nameBasedUniqueId
    return cachedService.name === (discoveredService.serviceName || discoveredService.name)
      && cachedService.serial === (discoveredService.accessoryInformation?.['Serial Number'] || discoveredService.serial)
      && cachedService.bridge === (discoveredService.instance?.username || discoveredService.bridge)
      && cachedService.uuid === discoveredService.uuid
  }

  /**
   * Find a cached service in the layout that matches a discovered service.
   * Returns the cached service and the room it belongs to, or null if not found.
   */
  private findInLayout(service: ServiceType): { room: AccessoryLayout[number], service: AccessoryLayoutService } | null {
    for (const room of this.accessoryLayout) {
      for (const cachedService of room.services) {
        if (!cachedService.name) {
          continue
        }
        if (this.servicesMatch(cachedService, service)) {
          return { room, service: cachedService }
        }
      }
    }
    return null
  }

  /**
   * Merge current layout with undiscovered services to preserve custom information
   */
  private mergeWithUndiscoveredServices(currentLayout: AccessoryLayout): AccessoryLayout {
    if (!this.originalLayout) {
      return currentLayout
    }

    // Create the merged layout starting with current rooms
    const mergedLayout: AccessoryLayout = JSON.parse(JSON.stringify(currentLayout))

    // Track which original services have been matched to a discovered service
    const matchedOriginalKeys = new Set<string>()

    // First pass: find all original services that match a discovered service
    for (const room of mergedLayout) {
      for (const discoveredService of room.services) {
        for (const originalRoom of this.originalLayout) {
          for (const originalService of originalRoom.services) {
            if (!originalService.name) {
              continue
            }
            if (this.servicesMatch(originalService, discoveredService)) {
              matchedOriginalKeys.add(this.getServiceKey(originalService))
              break
            }
          }
          if (matchedOriginalKeys.has(this.getServiceKey(discoveredService))) {
            break
          }
        }
      }
    }

    // Second pass: add unmatched services from original layout (truly undiscovered services)
    for (const originalRoom of this.originalLayout) {
      for (const originalService of originalRoom.services) {
        if (matchedOriginalKeys.has(this.getServiceKey(originalService))) {
          continue
        }
        if (!originalService.name) {
          continue
        }

        // Find the room for this undiscovered service
        let targetRoom = mergedLayout.find(room => room.name === originalRoom.name)

        // If the room doesn't exist in current layout, it was deleted by the user
        // Move undiscovered services to the default room instead of recreating the deleted room
        if (!targetRoom) {
          targetRoom = mergedLayout.find(room => room.isDefault)
          if (!targetRoom) {
            continue
          }
        }

        // Add the undiscovered service with its preserved custom information
        targetRoom.services.push({
          uniqueId: originalService.uniqueId,
          nameBasedUniqueId: originalService.nameBasedUniqueId,
          name: originalService.name,
          bridge: originalService.bridge,
          serial: originalService.serial,
          aid: originalService.aid,
          iid: originalService.iid,
          uuid: originalService.uuid,
          customName: originalService.customName,
          customType: originalService.customType,
          hidden: originalService.hidden,
          onDashboard: originalService.onDashboard,
        })
      }
    }

    // Keep rooms that either have services OR were in the current layout (user-created empty rooms)
    return mergedLayout.filter(room =>
      room.services.length > 0 || currentLayout.some(r => r.name === room.name),
    )
  }

  /**
   * Get a stable key for a service, preferring nameBasedUniqueId
   */
  private getServiceKey(service: any): string {
    return service.nameBasedUniqueId || service.uniqueId
  }

  /**
   * Parse the incoming accessory data and refresh existing accessory statuses
   */
  private parseServices(services: ServiceType[]) {
    if (!this.accessories.services.length) {
      this.accessories.services = services
      return
    }

    // Replace existing objects instead of mutating them for zoneless change detection
    services.forEach((service) => {
      const existingIndex = this.accessories.services.findIndex(x => x.uniqueId === service.uniqueId)

      // Special case for locks - if there exists just one mechanism and one management service, link them
      // This allows us to manage the settings for lock management inside the long press modal for the lock mechanism
      if (service.type === 'LockMechanism') {
        this.attachLockManagementToMechanism(service)
      }

      if (existingIndex !== -1) {
        // Replace the object instead of mutating it
        this.accessories.services[existingIndex] = service
        // Clear from customAttributesApplied Set so attributes get re-applied to the new object
        this.customAttributesApplied.delete(service.uniqueId!)
      } else {
        this.accessories.services.push(service)
      }
    })
  }

  /**
   * Sort the accessories into their rooms
   */
  private sortIntoRooms() {
    this.accessories.services.forEach((service) => {
      // Don't put hidden types or combined services into rooms
      // Matter services use deviceType instead of type
      if (this.hiddenTypes.has(service.type) || this.hiddenTypes.has((service as ServiceTypeX).deviceType!) || this.combinedServiceIds.has(service.uniqueId!)) {
        return
      }

      // Link services
      if (service.linked) {
        service.linkedServices = {}
        service.linked.forEach((iid) => {
          service.linkedServices![iid] = this.accessories.services.find(s => s.aid === service.aid && s.iid === iid
            && s.instance.username === service.instance.username)!
        })
      }

      // Check if the service has already been allocated to an active room
      const inRoom = this.rooms().find(r => r.services.find(s => s.uniqueId === service.uniqueId))

      // Not in an active room, perhaps the service is in the layout cache
      if (!inRoom) {
        const cached = this.findInLayout(service)

        if (cached) {
          // Apply custom attributes from cache before adding to room
          const serviceX = service as ServiceTypeX
          if (cached.service.customType) {
            serviceX.customType = cached.service.customType
          }
          if (cached.service.customName) {
            serviceX.customName = cached.service.customName
          }
          if (cached.service.hidden) {
            serviceX.hidden = cached.service.hidden
          }
          if (cached.service.onDashboard) {
            serviceX.onDashboard = cached.service.onDashboard
          }

          // Mark that custom attributes have been applied to this accessory
          this.customAttributesApplied.add(service.uniqueId!)

          // Add to the correct room using signal update
          this.rooms.update(current => current.map(r =>
            r.name === cached.room.name
              ? { ...r, services: [...r.services, service] }
              : r,
          ))
        } else {
          // Mark as processed (even though no custom attributes to apply)
          this.customAttributesApplied.add(service.uniqueId!)

          // New accessory add to the default room
          const defaultRoom = this.rooms().find(r => r.isDefault === true)
            || this.rooms().find(r => r.name === 'Default Room')

          if (defaultRoom) {
            this.rooms.update(current => current.map(r =>
              r.name === defaultRoom.name
                ? { ...r, services: [...r.services, service] }
                : r,
            ))
          } else {
            this.rooms.update(current => [...current, {
              name: 'Default Room',
              isDefault: true,
              services: [service],
            }])
          }
        }
      }
    })
  }

  /**
   * Order the services within each room based on the cached layout positions
   */
  private orderRooms() {
    this.rooms.update(current => current.map((room) => {
      const roomCache = this.accessoryLayout.find(r => r.name === room.name)
      if (!roomCache) {
        return room
      }

      const sortedServices = room.services.toSorted((a, b) => {
        const posA = roomCache.services.findIndex(s => this.servicesMatch(s, a))
        const posB = roomCache.services.findIndex(s => this.servicesMatch(s, b))
        return posA - posB
      })
      return { ...room, services: sortedServices }
    }))
  }

  /**
   * Refresh rooms to use updated service references for zoneless change detection
   * After parseServices() replaces service objects, we need to update the rooms
   * to point to the new service references from this.accessories.services
   */
  private refreshRoomsForChangeDetection() {
    this.rooms.update(current => current.map(room => ({
      ...room,
      services: room.services.map((service) => {
        // Find the updated service from the main accessories array
        const updatedService = this.accessories.services.find(s => s.uniqueId === service.uniqueId)
        return updatedService || service
      }),
    })))
  }

  /**
   * Apply custom attributes to services that haven't been processed yet
   * Only applies the custom properties we care about: customName, customType, hidden, onDashboard
   */
  private applyCustomAttributes() {
    this.rooms().forEach((room) => {
      room.services.forEach((service) => {
        // Skip if we've already applied custom attributes to this accessory
        if (this.customAttributesApplied.has(service.uniqueId!)) {
          return
        }

        // Use servicesMatch to find the cached service across any room in the layout
        const cached = this.findInLayout(service)
        if (!cached) {
          return
        }

        // Only apply the custom properties we care about, not all properties
        const serviceX = service as ServiceTypeX
        if (cached.service.customType) {
          serviceX.customType = cached.service.customType
        }
        if (cached.service.customName) {
          serviceX.customName = cached.service.customName
        }
        if (cached.service.hidden) {
          serviceX.hidden = cached.service.hidden
        }
        if (cached.service.onDashboard) {
          serviceX.onDashboard = cached.service.onDashboard
        }

        // Mark this accessory as processed
        this.customAttributesApplied.add(service.uniqueId!)
      })
    })
  }

  /**
   * Generate helpers for accessory control
   */
  private generateHelpers() {
    this.accessories.services.forEach((service) => {
      const serviceX = service as ServiceTypeX

      // Matter accessories use cluster-based control
      if (serviceX.protocol === 'matter') {
        if (!serviceX.getCluster) {
          serviceX.getCluster = (clusterName: string) => {
            const clusters = serviceX.clusters || {}

            if (!clusters[clusterName]) {
              return null
            }

            return {
              attributes: clusters[clusterName],
              /**
               * Fire-and-forget: emits a WebSocket message and resolves immediately.
               * The promise never rejects; errors are not surfaced to callers.
               * Try/catch blocks around setAttributes calls are therefore no-ops for
               * transport errors but kept for documentation and future-proofing.
               */
              setAttributes: (attributes: Record<string, unknown>) => new Promise<void>((resolve) => {
                if (!this.matterReadyForControl) {
                  console.warn('Matter control attempted but not ready for control:', {
                    matterReadyForControl: this.matterReadyForControl,
                    uniqueId: service.uniqueId,
                    cluster: clusterName,
                  })
                  return resolve(undefined)
                }

                this.io.socket.emit('accessory-control', {
                  set: {
                    uniqueId: service.uniqueId,
                    cluster: clusterName,
                    attributes,
                  },
                })
                return resolve(undefined)
              }),
            }
          }
        }
      } else {
        // HAP accessories use characteristic-based control
        if (!service.getCharacteristic) {
          service.getCharacteristic = ((type: string) => {
            const characteristic = service.serviceCharacteristics.find(x => x.type === type)

            if (!characteristic) {
              return null
            }

            characteristic.setValue = ((value: number | string | boolean) => new Promise<void>((resolve) => {
              if (!this.hapReadyForControl) {
                return resolve(undefined)
              }

              this.io.socket.emit('accessory-control', {
                set: {
                  uniqueId: service.uniqueId,
                  aid: service.aid,
                  siid: service.iid,
                  iid: characteristic.iid,
                  value,
                },
              })
              return resolve(undefined)
            })) as any

            return characteristic
          }) as any
        }
      }
    })
  }

  /**
   * Check if two services belong to the same physical accessory
   * (same name, serial number, and bridge instance)
   */
  private isSameAccessory(a: ServiceType, b: ServiceType): boolean {
    return a.accessoryInformation.Name === b.accessoryInformation.Name
      && a.accessoryInformation['Serial Number'] === b.accessoryInformation['Serial Number']
      && a.instance.username === b.instance.username
  }

  private attachLockManagementToMechanism(service: ServiceType) {
    const lockMechanisms: ServiceType[] = []
    const lockManagements: ServiceType[] = []

    for (const serv of this.accessories.services) {
      if (serv.type === 'LockMechanism' && this.isSameAccessory(serv, service)) {
        lockMechanisms.push(serv)
      } else if (serv.type === 'LockManagement' && this.isSameAccessory(serv, service)) {
        lockManagements.push(serv)
      }
    }

    if (lockMechanisms.length === 1 && lockManagements.length === 1) {
      const lockManagement = lockManagements[0]

      if (!service.linkedServices) {
        service.linkedServices = {}
      }
      service.linkedServices[lockManagement.iid] = lockManagement
    }
  }

  private attachFanToHeaterCooler(service: ServiceType) {
    const heaterCoolers: ServiceType[] = []
    const fans: ServiceType[] = []

    for (const serv of this.accessories.services) {
      if (this.isSameAccessory(serv, service)) {
        if (serv.type === 'HeaterCooler') {
          heaterCoolers.push(serv)
        } else if (serv.type === 'Fan' || serv.type === 'Fanv2') {
          fans.push(serv)
        }
      }
    }

    if (heaterCoolers.length === 1 && fans.length === 1) {
      const fan = fans[0]

      if (!service.linkedServices) {
        service.linkedServices = {}
      }
      service.linkedServices[fan.iid] = fan
      this.combinedServiceIds.add(fan.uniqueId!)
    }
  }

  private attachFanToHumidifierDehumidifier(service: ServiceType) {
    const humidifierDehumidifiers: ServiceType[] = []
    const fans: ServiceType[] = []

    for (const serv of this.accessories.services) {
      if (this.isSameAccessory(serv, service)) {
        if (serv.type === 'HumidifierDehumidifier') {
          humidifierDehumidifiers.push(serv)
        } else if (serv.type === 'Fan' || serv.type === 'Fanv2') {
          fans.push(serv)
        }
      }
    }

    if (humidifierDehumidifiers.length === 1 && fans.length === 1) {
      const fan = fans[0]

      if (!service.linkedServices) {
        service.linkedServices = {}
      }
      service.linkedServices[fan.iid] = fan
      this.combinedServiceIds.add(fan.uniqueId!)
    }
  }

  private combineRelatedServices() {
    this.combinedServiceIds.clear()

    for (const service of this.accessories.services) {
      if (service.type === 'HeaterCooler') {
        this.attachFanToHeaterCooler(service)
      } else if (service.type === 'HumidifierDehumidifier') {
        this.attachFanToHumidifierDehumidifier(service)
      }
    }

    // Remove combined fan services from rooms using immutable signal update
    this.rooms.update(current => current.map(room => ({
      ...room,
      services: room.services.filter(s => !this.combinedServiceIds.has(s.uniqueId!)),
    })))
  }
}
