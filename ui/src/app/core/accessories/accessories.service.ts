import type { ServiceType } from '@homebridge/hap-client'

import { createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, Injectable, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Subject } from 'rxjs'
import { takeUntil } from 'rxjs/operators'

import { AccessoryLayout, ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoryInfoComponent } from '@/app/core/accessories/accessory-info/accessory-info.component'
import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ACCESSORY_INFO_MODAL_DATA } from '@/app/core/modal-data-tokens'

@Injectable({
  providedIn: 'root',
})
export class AccessoriesService {
  private injector = inject(EnvironmentInjector)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $destroyRef = inject(DestroyRef)
  private $modal = inject(NgbModal)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private accessoryCache: any[] = []
  private pairingCache: any[] = []
  private customAttributesApplied = new Set<string>()
  private combinedServiceIds = new Set<string>()
  private io: IoNamespace
  private stop$ = new Subject<void>()
  private hiddenTypes = [
    'InputSource',
    'LockManagement',
    'CameraRTPStreamManagement',
    'ProtocolInformation',
    'NFCAccess',
  ]

  public layoutSaved = new Subject()
  public accessoryData = new Subject()
  public hapReadyForControl = false
  public matterReadyForControl = false
  public accessories: { services: ServiceType[] } = { services: [] }
  public accessoryLayout: AccessoryLayout
  private originalLayout: AccessoryLayout
  public availableBridges: string[] = []
  public selectedBridges: string[] | null = null
  public bridgeUsernameToNameMap: Map<string, string> = new Map()
  public rooms = signal<Array<{
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
      this.accessoryCache = await this.$api.get('/server/cached-accessories')
    } catch (error) {
      console.error(error)
    }

    try {
      this.pairingCache = await this.$api.get('/server/pairings')
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
      await ref.result
    } catch {
      // Modal dismissed
    } finally {
      this.saveLayout()
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

    this.io.end()
    this.rooms.set([])
    this.accessories = { services: [] }
    this.customAttributesApplied.clear()
    this.combinedServiceIds.clear()
    delete this.accessoryLayout
    delete this.originalLayout

    // Reset for next session
    this.stop$ = new Subject<void>()
  }

  /**
   * Start the accessory control session
   */
  public async start() {
    this.hapReadyForControl = false
    this.matterReadyForControl = false

    // Connect to the socket endpoint
    this.io = this.$ws.connectToNamespace('accessories')

    // Load the room layout first
    await this.loadLayout()

    // Subscribe for reconnections
    this.io.connected
      .pipe(takeUntil(this.stop$))
      .subscribe(() => {
        this.io.socket.emit('get-accessories')
      })

    // Check if already connected and initialize immediately
    if (this.io.socket.connected) {
      this.io.socket.emit('get-accessories')
    }

    // Subscribe to accessory events
    this.io.socket.on('accessories-data', (data: ServiceType[]) => {
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

    // When a new instance is available, do a self reload
    this.io.socket.on('accessories-reload-required', async () => {
      this.stop()
      await this.start()
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
        name: service.serviceName,
        serial: service.accessoryInformation['Serial Number'],
        bridge: service.instance.username,
        aid: service.aid,
        iid: service.iid,
        uuid: service.uuid,
        customName: service.customName || undefined,
        customType: service.customType || undefined,
        hidden: service.hidden || undefined,
        onDashboard: service.onDashboard || undefined,
      })),
    }))

    // Ensure at least one room has isDefault: true
    const hasDefaultRoom = currentLayout.some(r => r.isDefault === true)
    if (!hasDefaultRoom && currentLayout.length > 0) {
      currentLayout[0].isDefault = true
    }

    // Merge with undiscovered services from original layout to preserve custom information
    // This will add back rooms that exist in the original layout even if they have no discovered services
    this.accessoryLayout = this.mergeWithUndiscoveredServices(currentLayout)

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
          this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
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
      services: [],
    })))
  }

  /**
   * Check if a cached service matches a discovered service
   * Handles different matching logic for HAP vs Matter accessories
   */
  private servicesMatch(cachedService: any, discoveredService: any): boolean {
    const isMatterAccessory = discoveredService.protocol === 'matter' || discoveredService.uniqueId?.startsWith('matter:')
    if (isMatterAccessory) {
      // Matter-specific matching: uuid + bridge
      return cachedService.uniqueId === discoveredService.uniqueId
        && cachedService.bridge === (discoveredService.instance?.username || discoveredService.bridge)
    } else {
      // HAP-specific matching: primary match - by uniqueId
      if (cachedService.uniqueId === discoveredService.uniqueId) {
        return true
      }

      return cachedService.name === (discoveredService.serviceName || discoveredService.name)
        && cachedService.serial === (discoveredService.accessoryInformation?.['Serial Number'] || discoveredService.serial)
        && cachedService.bridge === (discoveredService.instance?.username || discoveredService.bridge)
        && cachedService.uuid === discoveredService.uuid
    }
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

    // Track which services have been matched
    const matchedOriginalServices = new Set<string>()

    // First pass: Apply custom properties from original layout to discovered services
    // This includes both uniqueId matches and fallback matches
    mergedLayout.forEach((room) => {
      room.services.forEach((discoveredService) => {
        let matchedOriginalService = null

        // Try to find matching service in original layout
        for (const originalRoom of this.originalLayout) {
          for (const originalService of originalRoom.services) {
            // Skip services without name (cleanup old cache files)
            if (!originalService.name) {
              continue
            }

            // Use helper method to check if services match
            if (this.servicesMatch(originalService, discoveredService)) {
              matchedOriginalService = originalService
              break
            }
          }
          if (matchedOriginalService) {
            break
          }
        }

        // If we found a match, just track it - don't override custom properties
        // The discoveredService already has the correct values from the current session
        if (matchedOriginalService) {
          // Mark this original service as matched
          matchedOriginalServices.add(matchedOriginalService.uniqueId)
        }
      })
    })

    // Second pass: Add unmatched services from original layout (truly undiscovered services)
    this.originalLayout.forEach((originalRoom) => {
      originalRoom.services.forEach((originalService) => {
        // Skip if this service was already matched to a discovered service
        if (matchedOriginalServices.has(originalService.uniqueId)) {
          return
        }

        // Skip services without a name - this cleans up old cache files that don't have names
        if (!originalService.name) {
          return
        }

        // Find the room for this undiscovered service
        let targetRoom = mergedLayout.find(room => room.name === originalRoom.name)

        // If the room doesn't exist in current layout, it was deleted by the user
        // Move undiscovered services to the default room instead of recreating the deleted room
        if (!targetRoom) {
          targetRoom = mergedLayout.find(room => room.isDefault)
          // If no default room exists, skip this service (shouldn't happen but safety check)
          if (!targetRoom) {
            return
          }
        }

        // Add the undiscovered service with its preserved custom information
        targetRoom.services.push({
          uniqueId: originalService.uniqueId,
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
      })
    })

    // Keep rooms that either have services OR were in the current layout (user-created empty rooms)
    // This filters out rooms that only existed in originalLayout with undiscovered services
    return mergedLayout.filter(room =>
      room.services.length > 0 || currentLayout.some(r => r.name === room.name),
    )
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
        this.customAttributesApplied.delete(service.uniqueId)
      } else {
        this.accessories.services.push(service)
      }
    })
  }

  /**
   * Sort the accessories into their rooms
   */
  private sortIntoRooms() {
    const hiddenTypesSet = new Set(this.hiddenTypes)

    this.accessories.services.forEach((service) => {
      // Don't put hidden types or combined services into rooms
      if (hiddenTypesSet.has(service.type) || this.combinedServiceIds.has(service.uniqueId)) {
        return
      }

      // Link services
      if (service.linked) {
        service.linkedServices = {}
        service.linked.forEach((iid) => {
          service.linkedServices[iid] = this.accessories.services.find(s => s.aid === service.aid && s.iid === iid
            && s.instance.username === service.instance.username)
        })
      }

      // Check if the service has already been allocated to an active room
      const inRoom = this.rooms().find(r => r.services.find(s => s.uniqueId === service.uniqueId))

      // Not in an active room, perhaps the service is in the layout cache
      if (!inRoom) {
        let inCache = null
        let serviceCache = null

        // Try to find the service in cache using the same matching logic as mergeWithUndiscoveredServices
        for (const room of this.accessoryLayout) {
          serviceCache = room.services.find(s => this.servicesMatch(s, service))
          if (serviceCache) {
            inCache = room
            break
          }
        }

        if (inCache && serviceCache) {
          // Apply custom attributes from cache before adding to room
          if (serviceCache.customType) {
            (service as ServiceTypeX).customType = serviceCache.customType
          }
          if (serviceCache.customName) {
            (service as ServiceTypeX).customName = serviceCache.customName
          }
          if (serviceCache.hidden) {
            (service as ServiceTypeX).hidden = serviceCache.hidden
          }
          if (serviceCache.onDashboard) {
            (service as ServiceTypeX).onDashboard = serviceCache.onDashboard
          }

          // Mark that custom attributes have been applied to this accessory
          this.customAttributesApplied.add(service.uniqueId)

          // Add to the correct room using signal update
          this.rooms.update(current => current.map(r =>
            r.name === inCache.name
              ? { ...r, services: [...r.services, service] }
              : r,
          ))
        } else {
          // Mark as processed (even though no custom attributes to apply)
          this.customAttributesApplied.add(service.uniqueId)

          // New accessory add to the default room
          // First try to find a room with isDefault: true, then fall back to room named "Default Room"
          let defaultRoom = this.rooms().find(r => r.isDefault === true)
          if (!defaultRoom) {
            defaultRoom = this.rooms().find(r => r.name === 'Default Room')
          }

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
   * Order the rooms on the screen
   */
  private orderRooms() {
    // Order the services within each room using immutable update
    this.rooms.update(current => current.map((room) => {
      const roomCache = this.accessoryLayout.find(r => r.name === room.name)
      const sortedServices = [...room.services].sort((a, b) => {
        const posA = roomCache.services.findIndex(s => s.uniqueId === a.uniqueId)
        const posB = roomCache.services.findIndex(s => s.uniqueId === b.uniqueId)
        if (posA < posB) {
          return -1
        } else if (posA > posB) {
          return 1
        }
        return 0
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
      const roomCache = this.accessoryLayout.find(r => r.name === room.name)
      if (!roomCache) {
        return
      }

      room.services.forEach((service) => {
        // Skip if we've already applied custom attributes to this accessory
        if (this.customAttributesApplied.has(service.uniqueId)) {
          return
        }

        const serviceCache = roomCache.services.find(s => s.uniqueId === service.uniqueId)
        if (!serviceCache) {
          return
        }

        // Only apply the custom properties we care about, not all properties
        const serviceX = service as ServiceTypeX
        if (serviceCache.customType) {
          serviceX.customType = serviceCache.customType
        }
        if (serviceCache.customName) {
          serviceX.customName = serviceCache.customName
        }
        if (serviceCache.hidden) {
          serviceX.hidden = serviceCache.hidden
        }
        if (serviceCache.onDashboard) {
          serviceX.onDashboard = serviceCache.onDashboard
        }

        // Mark this accessory as processed
        this.customAttributesApplied.add(service.uniqueId)
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
              setAttributes: (attributes: Record<string, unknown>) => new Promise<void>((resolve) => {
                if (!this.matterReadyForControl) {
                  console.warn('Matter control attempted but not ready for control:', {
                    matterReadyForControl: this.matterReadyForControl,
                    uniqueId: service.uniqueId,
                    cluster: clusterName,
                  })
                  resolve(undefined)
                  return
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
          service.getCharacteristic = (type: string) => {
            const characteristic = service.serviceCharacteristics.find(x => x.type === type)

            if (!characteristic) {
              return null
            }

            characteristic.setValue = (value: number | string | boolean) => new Promise((resolve) => {
              if (!this.hapReadyForControl) {
                resolve(undefined)
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
            })

            return characteristic
          }
        }
      }
    })
  }

  private attachLockManagementToMechanism(service: ServiceType) {
    // Find the corresponding LockManagement service
    const lockMechanisms: ServiceType[] = []
    const lockManagements: ServiceType[] = []

    // This is a bit of a hack to find matching services for a specific accessory
    for (const serv of this.accessories.services) {
      if (serv.type === 'LockMechanism' && serv.accessoryInformation.Name === service.accessoryInformation.Name && serv.accessoryInformation['Serial Number'] === service.accessoryInformation['Serial Number']) {
        lockMechanisms.push(serv)
      } else if (serv.type === 'LockManagement' && serv.accessoryInformation.Name === service.accessoryInformation.Name && serv.accessoryInformation['Serial Number'] === service.accessoryInformation['Serial Number']) {
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
      if (serv.accessoryInformation.Name === service.accessoryInformation.Name && serv.accessoryInformation['Serial Number'] === service.accessoryInformation['Serial Number']) {
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
      this.combinedServiceIds.add(fan.uniqueId)
    }
  }

  private attachFanToHumidifierDehumidifier(service: ServiceType) {
    const humidifierDehumidifiers: ServiceType[] = []
    const fans: ServiceType[] = []

    for (const serv of this.accessories.services) {
      if (serv.accessoryInformation.Name === service.accessoryInformation.Name && serv.accessoryInformation['Serial Number'] === service.accessoryInformation['Serial Number']) {
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
      this.combinedServiceIds.add(fan.uniqueId)
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

    // Remove combined fan services from rooms in case they were added before combination was detected
    for (const room of this.rooms()) {
      room.services = room.services.filter(s => !this.combinedServiceIds.has(s.uniqueId))
    }
  }
}
