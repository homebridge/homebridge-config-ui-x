import type { ServiceType } from '@homebridge/hap-client'

import { inject, Injectable } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Subject } from 'rxjs'

import { AccessoryLayout, ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoryInfoComponent } from '@/app/core/accessories/accessory-info/accessory-info.component'
import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'

@Injectable({
  providedIn: 'root',
})
export class AccessoriesService {
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $modal = inject(NgbModal)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private accessoryCache: any[] = []
  private pairingCache: any[] = []
  private customAttributesApplied = new Set<string>()
  private io: IoNamespace
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
  public rooms: Array<{ name: string, services: ServiceTypeX[] }> = []
  public accessoryLayout: AccessoryLayout
  private originalLayout: AccessoryLayout

  constructor() {
    if (this.$auth.user.admin) {
      firstValueFrom(this.$api.get('/server/cached-accessories'))
        .then((data) => {
          this.accessoryCache = data
        })
        .catch(error => console.error(error))
      firstValueFrom(this.$api.get('/server/pairings'))
        .then((data) => {
          this.pairingCache = data
        })
        .catch(error => console.error(error))
    }
  }

  public showAccessoryInformation(service: ServiceTypeX) {
    const ref = this.$modal.open(AccessoryInfoComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.service = service
    ref.componentInstance.accessoryCache = this.accessoryCache
    ref.componentInstance.pairingCache = this.pairingCache

    ref.result
      .then(() => this.saveLayout())
      .catch(() => this.saveLayout())

    return false
  }

  /**
   * Stop the accessory control session
   */
  public stop() {
    this.io.end()
    this.rooms = []
    this.accessories = { services: [] }
    this.customAttributesApplied.clear()
    delete this.accessoryLayout
    delete this.originalLayout
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

    // Start accessory subscription
    if (this.io.connected) {
      this.io.socket.emit('get-accessories')
      setTimeout(() => {
        this.io.connected.subscribe(() => {
          this.io.socket.emit('get-accessories')
        })
      }, 1000)
    } else {
      this.io.connected.subscribe(() => {
        this.io.socket.emit('get-accessories')
      })
    }

    // Subscribe to accessory events
    this.io.socket.on('accessories-data', (data: ServiceType[]) => {
      this.parseServices(data)
      this.generateHelpers()
      this.sortIntoRooms()

      // Always order rooms to handle accessories that arrive late (e.g., Matter accessories)
      this.orderRooms()

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
    const currentLayout = this.rooms.map(room => ({
      name: room.name,
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
    })).filter(room => room.services.length)

    // Merge with undiscovered services from original layout to preserve custom information
    this.accessoryLayout = this.mergeWithUndiscoveredServices(currentLayout)

    // Send update request to server
    this.io.request('save-layout', { user: this.$auth.user.username, layout: this.accessoryLayout }).subscribe({
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

    // Build empty room layout
    this.rooms = this.accessoryLayout.map(room => ({
      name: room.name,
      services: [],
    }))
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

        // Find or create the room for this undiscovered service
        let targetRoom = mergedLayout.find(room => room.name === originalRoom.name)
        if (!targetRoom) {
          targetRoom = {
            name: originalRoom.name,
            services: [],
          }
          mergedLayout.push(targetRoom)
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

    return mergedLayout.filter(room => room.services.length)
  }

  /**
   * Parse the incoming accessory data and refresh existing accessory statuses
   */
  private parseServices(services: ServiceType[]) {
    if (!this.accessories.services.length) {
      this.accessories.services = services
      return
    }

    // Update the existing objects to avoid re-painting the dom element each refresh
    services.forEach((service) => {
      const existing = this.accessories.services.find(x => x.uniqueId === service.uniqueId)

      // Special case for locks - if there exists just one mechanism and one management service, link them
      // This allows us to manage the settings for lock management inside the long press modal for the lock mechanism
      if (service.type === 'LockMechanism') {
        this.attachLockManagementToMechanism(service)
      }

      if (existing) {
        Object.assign(existing, service)
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
      // Don't put hidden types into rooms
      if (hiddenTypesSet.has(service.type)) {
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
      const inRoom = this.rooms.find(r => r.services.find(s => s.uniqueId === service.uniqueId))

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
          // It's in the cache, add to the correct room
          const targetRoom = this.rooms.find(r => r.name === inCache.name)

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

          targetRoom.services.push(service)
        } else {
          // New accessory add the default room
          const defaultRoom = this.rooms.find(r => r.name === 'Default Room')

          // Mark as processed (even though no custom attributes to apply)
          this.customAttributesApplied.add(service.uniqueId)

          // Does the default room exist?
          if (defaultRoom) {
            defaultRoom.services.push(service)
          } else {
            this.rooms.push({
              name: 'Default Room',
              services: [service],
            })
          }
        }
      }
    })
  }

  /**
   * Order the rooms on the screen
   */
  private orderRooms() {
    // Order the services within each room
    this.rooms.forEach((room) => {
      const roomCache = this.accessoryLayout.find(r => r.name === room.name)
      room.services.sort((a, b) => {
        const posA = roomCache.services.findIndex(s => s.uniqueId === a.uniqueId)
        const posB = roomCache.services.findIndex(s => s.uniqueId === b.uniqueId)
        if (posA < posB) {
          return -1
        } else if (posA > posB) {
          return 1
        }
        return 0
      })
    })
  }

  /**
   * Apply custom attributes to services that haven't been processed yet
   * Only applies the custom properties we care about: customName, customType, hidden, onDashboard
   */
  private applyCustomAttributes() {
    this.rooms.forEach((room) => {
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
}
