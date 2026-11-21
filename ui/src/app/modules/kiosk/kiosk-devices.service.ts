import type { KioskScope } from '@/app/modules/kiosk/kiosk-scope'

import { DestroyRef, inject, Injectable } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, merge, timeout } from 'rxjs'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { resolveScopeUniqueIds } from '@/app/modules/kiosk/kiosk-resolve'

/** How long to wait for the accessories to arrive when a session is started just to resolve a scope */
const ROOMS_TIMEOUT = 15_000

export interface KioskDevice {
  id: string
  name: string
  owner: string
  scope: KioskScope
  scopeLabel: string
  allowSensitive: boolean
  allowedUniqueIds: string[]
  createdAt: string
  lastSeenAt?: string
  lastSeenIp?: string
  paired: boolean
}

export interface KioskDeviceInput {
  name: string
  scope: KioskScope
  scopeLabel: string
  allowSensitive: boolean
  allowedUniqueIds: string[]
}

export interface PairingCode {
  code: string
  expiresAt: string
}

/**
 * Admin side of the paired tablets: the device API, and keeping each device's accessories in step with its scope.
 */
@Injectable({
  providedIn: 'root',
})
export class KioskDevicesService {
  private $accessories = inject(AccessoriesService)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $errors = inject(HttpErrorService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private startedSession = false

  constructor() {
    if (this.$auth.user.admin) {
      // Layout or labels and floors saved on the accessories page: re-send the accessories of each tablet whose set changed
      merge(this.$accessories.layoutSaved, this.$accessories.metadataSaved)
        .pipe(takeUntilDestroyed(inject(DestroyRef)))
        .subscribe(() => void this.resyncOwnedDevices())
    }
  }

  public list(): Promise<KioskDevice[]> {
    return this.$api.get('/kiosk/devices')
  }

  public create(input: KioskDeviceInput): Promise<KioskDevice> {
    return this.$api.post('/kiosk/devices', input)
  }

  public update(id: string, patch: Partial<KioskDeviceInput>): Promise<KioskDevice> {
    return this.$api.patch(`/kiosk/devices/${encodeURIComponent(id)}`, patch)
  }

  public remove(id: string): Promise<void> {
    return this.$api.delete(`/kiosk/devices/${encodeURIComponent(id)}`)
  }

  public pairingCode(id: string): Promise<PairingCode> {
    return this.$api.post(`/kiosk/devices/${encodeURIComponent(id)}/pairing-code`, {})
  }

  /**
   * Make sure the accessories are loaded so scopes can be resolved. Starts a session only when none is running here,
   * and releaseSession() stops only what this service started.
   */
  public async ensureSession(): Promise<void> {
    if (this.$accessories.sessionRunning) {
      return
    }
    this.startedSession = true
    const dataReady = firstValueFrom(this.$accessories.accessoryData.pipe(timeout(ROOMS_TIMEOUT))).catch(() => undefined)
    try {
      await this.$accessories.start()
    } catch (error) {
      console.error(error)
    }
    await dataReady
  }

  public releaseSession(): void {
    if (this.startedSession) {
      this.startedSession = false
      this.$accessories.stop()
    }
  }

  /** The uniqueIds a scope resolves to now. Needs the accessories loaded (see ensureSession). */
  public resolveAllowed(scope: KioskScope): string[] {
    return resolveScopeUniqueIds(scope, this.$accessories.rooms(), this.$accessories.filterContext().labels)
  }

  /** Recompute a tablet's accessories from its stored scope and save them */
  public async refreshDevice(device: KioskDevice): Promise<KioskDevice> {
    await this.ensureSession()
    try {
      return await this.update(device.id, {
        allowedUniqueIds: this.resolveAllowed(device.scope),
      })
    } finally {
      this.releaseSession()
    }
  }

  /** After the layout or labels and floors are saved: re-send the accessories of this admin's tablets whose set has changed. Best effort. */
  private async resyncOwnedDevices(): Promise<void> {
    // Without loaded rooms the scope would resolve to nothing, and that must never be saved to a tablet
    if (this.$accessories.rooms().length === 0) {
      return
    }
    let devices: KioskDevice[]
    try {
      devices = await this.list()
    } catch (error) {
      console.warn('Could not load tablets to update their accessories:', error)
      return
    }

    for (const device of devices) {
      if (device.owner !== this.$auth.user.username) {
        continue
      }
      const allowed = this.resolveAllowed(device.scope)
      if (sameIds(allowed, device.allowedUniqueIds)) {
        continue
      }
      try {
        await this.update(device.id, { allowedUniqueIds: allowed })
      } catch (error) {
        console.error(error)
        this.$toastr.error(
          this.$translate.instant('kiosk.tablets.resync_failed', {
            name: device.name,
            error: this.$errors.toToastMessage(error),
          }),
          this.$translate.instant('toast.title_error'),
        )
      }
    }
  }
}

function sameIds(a: string[], b: string[] | undefined): boolean {
  if (!b || a.length !== b.length) {
    return false
  }
  const set = new Set(b)
  return a.every(id => set.has(id))
}
