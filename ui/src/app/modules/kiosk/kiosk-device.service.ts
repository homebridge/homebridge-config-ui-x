import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { AccessoryGroup } from '@/app/core/accessories/filters/accessory-filters'
import type { Socket } from 'socket.io-client'

import { HttpBackend, HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http'
import { computed, inject, Injectable, signal } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { attachControlHelpers } from '@/app/core/accessories/accessory-control'
import { isMatterService } from '@/app/core/accessories/filters/service-helpers'
import { SOCKET_FACTORY } from '@/app/core/communication/socket.factory'
import { environment } from '@/environments/environment'

/** localStorage key for the pairing of this tablet */
export const KIOSK_DEVICE_STORAGE_KEY = 'kiosk-device-v1'

export interface StoredKioskDevice {
  token: string
  deviceId: string
}

export interface PairedKioskDevice {
  token: string
  device: { id: string, name: string, scopeLabel: string }
}

export interface KioskDeviceSession {
  device: { id: string, name: string, scopeLabel: string, allowSensitive: boolean }
  rooms: Array<{ name: string, services: Array<{ uniqueId: string, customName?: string }> }>
}

export interface KioskDeviceRoom {
  name: string
  services: ServiceTypeX[]
}

/** The stored pairing, or null when there is none, or storage cannot be read */
export function loadStoredDevice(): StoredKioskDevice | null {
  try {
    const raw = window.localStorage.getItem(KIOSK_DEVICE_STORAGE_KEY)
    const parsed = raw
      ? JSON.parse(raw)
      : null
    if (parsed && typeof parsed.token === 'string' && parsed.token && typeof parsed.deviceId === 'string') {
      return { token: parsed.token, deviceId: parsed.deviceId }
    }
  } catch {
    // Unreadable or blocked storage: treated as not paired
  }
  return null
}

/** Remember the pairing. Returns false when the browser will not store it. */
export function saveStoredDevice(stored: StoredKioskDevice): boolean {
  try {
    window.localStorage.setItem(KIOSK_DEVICE_STORAGE_KEY, JSON.stringify(stored))
    return true
  } catch {
    return false
  }
}

export function clearStoredDevice(): void {
  try {
    window.localStorage.removeItem(KIOSK_DEVICE_STORAGE_KEY)
  } catch {
    // Nothing to clear when storage is unavailable
  }
}

/**
 * Data for a paired tablet (kiosk device mode). It talks to the server with the device token only: its own HTTP
 * client on the raw backend, so no JWT is attached and a 401 cannot log out a signed-in session.
 */
@Injectable({
  providedIn: 'root',
})
export class KioskDeviceService {
  private $socketFactory = inject(SOCKET_FACTORY)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $http = new HttpClient(inject(HttpBackend))

  private socket: Socket | undefined
  private hapReadyForControl = false
  private matterReadyForControl = false

  public readonly session = signal<KioskDeviceSession | null>(null)
  public readonly connected = signal(false)
  /** Set when the server no longer accepts this tablet's token */
  public readonly unpaired = signal(false)
  private readonly liveServices = signal(new Map<string, ServiceTypeX>())

  /** The session's rooms, with each service's live state. Services without data yet are left out. */
  public readonly rooms = computed<KioskDeviceRoom[]>(() => {
    const session = this.session()
    if (!session) {
      return []
    }
    const live = this.liveServices()
    return session.rooms.map(room => ({
      name: room.name,
      services: room.services
        .map((entry) => {
          const service = live.get(entry.uniqueId)
          return service
            ? { ...service, customName: entry.customName ?? service.customName } as ServiceTypeX
            : undefined
        })
        .filter((service): service is ServiceTypeX => !!service),
    }))
  })

  public readonly groups = computed<AccessoryGroup[]>(() => this.rooms()
    .map(room => ({ key: room.name, label: room.name, services: room.services }))
    .filter(group => group.services.length > 0))

  /** Exchange a pairing code for a token */
  public pair(code: string): Promise<PairedKioskDevice> {
    return firstValueFrom(this.$http.post<PairedKioskDevice>(`${environment.api.base}/kiosk/pair`, { code }))
  }

  /**
   * Load the session and open the live socket. Rejects with an HttpErrorResponse; a 401 means the tablet is unpaired
   * (and the caller should call markUnpaired), anything else is a connection problem worth retrying.
   */
  public async connect(token: string): Promise<void> {
    this.disconnect()
    this.unpaired.set(false)
    this.session.set(await this.fetchSession(token))
    this.openSocket(token)
  }

  /** Ask the server whether the token still works. A 401 marks the tablet unpaired. */
  public async checkPairing(token: string): Promise<boolean> {
    try {
      this.session.set(await this.fetchSession(token))
      return true
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.markUnpaired()
        return false
      }
      return true
    }
  }

  /** The token was refused: stop, forget the pairing here, and show the unpaired state */
  public markUnpaired(): void {
    this.disconnect()
    clearStoredDevice()
    this.unpaired.set(true)
  }

  public disconnect(): void {
    this.socket?.disconnect()
    this.socket = undefined
    this.connected.set(false)
    this.hapReadyForControl = false
    this.matterReadyForControl = false
    this.liveServices.set(new Map())
    this.session.set(null)
  }

  /** Whether a service's protocol is ready for control on this tablet */
  public isReady(service: ServiceTypeX): boolean {
    return isMatterService(service)
      ? this.matterReadyForControl
      : this.hapReadyForControl
  }

  private fetchSession(token: string): Promise<KioskDeviceSession> {
    return firstValueFrom(this.$http.get<KioskDeviceSession>(`${environment.api.base}/kiosk/session`, {
      headers: new HttpHeaders({ Authorization: `Kiosk ${token}` }),
    }))
  }

  private openSocket(token: string): void {
    const socket = this.$socketFactory(`${environment.api.socket}/kiosk`, {
      auth: { kioskToken: token },
      reconnectionAttempts: 10,
      reconnectionDelayMax: 30000,
    })
    this.socket = socket

    const channel = {
      send: (payload: Record<string, unknown>) => socket.emit('accessory-control', payload),
      hapReady: () => this.hapReadyForControl,
      matterReady: () => this.matterReadyForControl,
    }

    socket.on('connect', () => {
      this.connected.set(true)
      socket.emit('get-accessories')
    })
    socket.on('disconnect', () => this.connected.set(false))
    socket.on('connect_error', () => {
      this.connected.set(false)
      void this.checkPairing(token).then((stillPaired) => {
        if (!stillPaired) {
          this.disconnect()
        }
      })
    })
    socket.on('accessories-data', (data: ServiceTypeX[]) => {
      const services = new Map<string, ServiceTypeX>()
      for (const service of data) {
        attachControlHelpers(service, channel)
        services.set(service.uniqueId!, service)
      }
      this.liveServices.set(services)
    })
    socket.on('accessories-reload-required', () => socket.emit('accessory-control', { refresh: true }))
    socket.on('matter-accessories-reload-required', () => {
      this.matterReadyForControl = false
      socket.emit('accessory-control', { refresh: true })
    })
    socket.on('hap-accessories-ready-for-control', () => {
      this.hapReadyForControl = true
    })
    socket.on('matter-accessories-ready-for-control', () => {
      this.matterReadyForControl = true
    })
    socket.on('accessory-control-failure', (message: string) => {
      console.error(message)
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
    })
  }
}
