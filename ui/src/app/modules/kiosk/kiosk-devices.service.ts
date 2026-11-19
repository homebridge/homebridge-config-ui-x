import type { AccessoryView } from '@/app/core/accessories/filters/accessory-views'

import { DestroyRef, inject, Injectable } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, timeout } from 'rxjs'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { findKioskView, resolveViewUniqueIds } from '@/app/modules/kiosk/kiosk-resolve'

/** How long to wait for the accessories to arrive when a session is started just to resolve a view */
const ROOMS_TIMEOUT = 15_000

export interface KioskDevice {
  id: string
  name: string
  owner: string
  viewId: string
  viewName: string
  allowSensitive: boolean
  allowedUniqueIds: string[]
  createdAt: string
  lastSeenAt?: string
  lastSeenIp?: string
  paired: boolean
}

export interface KioskDeviceInput {
  name: string
  viewId: string
  viewName: string
  allowSensitive: boolean
  allowedUniqueIds: string[]
}

export interface PairingCode {
  code: string
  expiresAt: string
}

/**
 * Admin side of the paired tablets: the device API, and keeping each device's accessories in step with its view.
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
      // Views saved on the accessories page: re-send the accessories of each tablet whose view changed
      this.$accessories.viewsSaved
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

  /** The views a tablet can show: built-in, the user's own, and those shared with them */
  public views(): AccessoryView[] {
    return this.$accessories.views()
  }

  /**
   * Make sure the accessories are loaded so views can be resolved. Starts a session only when none is running here,
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

  /** The uniqueIds a view resolves to now. Needs the accessories loaded (see ensureSession). */
  public resolveAllowed(view: AccessoryView): string[] {
    return resolveViewUniqueIds(view, this.$accessories.rooms(), this.$accessories.filterContext())
  }

  /** Recompute a tablet's accessories from its view and save them */
  public async refreshDevice(device: KioskDevice): Promise<KioskDevice> {
    const view = findKioskView(device.viewId, this.views())
    if (!view) {
      throw new Error(`No view ${device.viewId}`)
    }
    await this.ensureSession()
    try {
      return await this.update(device.id, {
        allowedUniqueIds: this.resolveAllowed(view),
      })
    } finally {
      this.releaseSession()
    }
  }

  /** After views are saved: re-send the accessories of this admin's tablets whose view has changed. Best effort. */
  private async resyncOwnedDevices(): Promise<void> {
    // Without loaded rooms the view would resolve to nothing, and that must never be saved to a tablet
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

    const views = this.views()
    for (const device of devices) {
      const view = device.owner === this.$auth.user.username
        ? findKioskView(device.viewId, views)
        : undefined
      if (!view) {
        continue
      }
      const allowed = this.resolveAllowed(view)
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
