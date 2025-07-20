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
  private io: IoNamespace
  private roomsOrdered = false
  private hiddenTypes = [
    'InputSource',
    'LockManagement',
    'CameraRTPStreamManagement',
    'ProtocolInformation',
  ]

  public layoutSaved = new Subject()
  public accessoryData = new Subject()
  public readyForControl = false
  public accessories: { services: ServiceType[] } = { services: [] }
  public rooms: Array<{ name: string, services: ServiceTypeX[] }> = []
  public accessoryLayout: AccessoryLayout

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

  public showAccessoryInformation(service: any) {
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
    this.roomsOrdered = false
    delete this.accessoryLayout
  }

  /**
   * Start the accessory control session
   */
  public async start() {
    this.readyForControl = false

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

      if (!this.roomsOrdered) {
        this.orderRooms()
        this.applyCustomAttributes()
        this.roomsOrdered = true
      }

      this.accessoryData.next(data)
    })

    // When a new instance is available, do a self reload
    this.io.socket.on('accessories-reload-required', async () => {
      this.stop()
      await this.start()
    })

    this.io.socket.on('accessory-control-failure', (message: string) => {
      console.error(message)
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
    })

    // When the system is ready for accessory control
    this.io.socket.on('accessories-ready-for-control', () => {
      this.readyForControl = true
    })
  }

  /**
   * Save the room layout
   */
  public saveLayout() {
    // Generate layout schema to save to disk
    this.accessoryLayout = this.rooms.map(room => ({
      name: room.name,
      services: room.services.map(service => ({
        uniqueId: service.uniqueId,
        aid: service.aid,
        iid: service.iid,
        uuid: service.uuid,
        customName: service.customName || undefined,
        customType: service.customType || undefined,
        hidden: service.hidden || undefined,
        onDashboard: service.onDashboard || undefined,
      })),
    })).filter(room => room.services.length)

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

    // Build empty room layout
    this.rooms = this.accessoryLayout.map(room => ({
      name: room.name,
      services: [],
    }))
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
    this.accessories.services.forEach((service) => {
      // Don't put hidden types into rooms
      if (this.hiddenTypes.includes(service.type)) {
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
        const inCache = this.accessoryLayout.find(r => r.services.find(s => s.uniqueId === service.uniqueId))

        if (inCache) {
          // It's in the cache, add to the correct room
          this.rooms.find(r => r.name === inCache.name).services.push(service)
        } else {
          // New accessory add the default room
          const defaultRoom = this.rooms.find(r => r.name === 'Default Room')

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
   * Setup custom attributes
   */
  private applyCustomAttributes() {
    // Apply custom saved attributes to the service
    this.rooms.forEach((room) => {
      const roomCache = this.accessoryLayout.find(r => r.name === room.name)
      room.services.forEach((service) => {
        const serviceCache = roomCache.services.find(s => s.uniqueId === service.uniqueId)
        Object.assign(service, serviceCache)
      })
    })
  }

  /**
   * Generate helpers for accessory control
   */
  private generateHelpers() {
    this.accessories.services.forEach((service) => {
      if (!service.getCharacteristic) {
        service.getCharacteristic = (type: string) => {
          const characteristic = service.serviceCharacteristics.find(x => x.type === type)

          if (!characteristic) {
            return null
          }

          characteristic.setValue = (value: number | string | boolean) => new Promise((resolve) => {
            if (!this.readyForControl) {
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
