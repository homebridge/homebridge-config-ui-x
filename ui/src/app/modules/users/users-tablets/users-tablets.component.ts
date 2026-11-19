import type { KioskDevice } from '@/app/modules/kiosk/kiosk-devices.service'

import { ChangeDetectionStrategy, Component, createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, OnInit, signal } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { CONFIRM_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { KioskDevicesService } from '@/app/modules/kiosk/kiosk-devices.service'
import { openAddTablet, openPairing } from '@/app/modules/users/users-tablets/open-tablet-editor'
import { TabletEditComponent } from '@/app/modules/users/users-tablets/tablet-edit.component'

/** The paired tablets, on the Users page (admins only) */
@Component({
  selector: 'app-users-tablets',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './users-tablets.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersTabletsComponent implements OnInit {
  private $devices = inject(KioskDevicesService)
  private $errors = inject(HttpErrorService)
  private $injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $destroyRef = inject(DestroyRef)

  protected readonly devices = signal<KioskDevice[]>([])
  protected readonly loading = signal(true)
  /** The tablet whose accessories are being recomputed, so its button can show progress */
  protected readonly refreshing = signal<string | null>(null)

  public ngOnInit(): void {
    void this.reload()
    this.$destroyRef.onDestroy(() => this.$devices.releaseSession())
  }

  protected async reload(): Promise<void> {
    try {
      this.devices.set(await this.$devices.list())
    } catch (error) {
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    } finally {
      this.loading.set(false)
    }
  }

  protected async addTablet(): Promise<void> {
    if (await openAddTablet(this.$modal)) {
      void this.reload()
    }
  }

  protected async editTablet(device: KioskDevice): Promise<void> {
    const ref = this.$modal.open(TabletEditComponent, { size: 'lg', backdrop: 'static' })
    ref.componentInstance.device = device
    try {
      await ref.result
      void this.reload()
    } catch {
      // Dismissed: nothing changed
    }
  }

  protected async pair(device: KioskDevice): Promise<void> {
    await openPairing(this.$modal, device)
  }

  protected async setAllowSensitive(device: KioskDevice, event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked
    try {
      await this.$devices.update(device.id, { allowSensitive: checked })
      this.devices.update(list => list.map(entry => entry.id === device.id
        ? { ...entry, allowSensitive: checked }
        : entry))
    } catch (error) {
      (event.target as HTMLInputElement).checked = !checked
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    }
  }

  protected async refreshAccessories(device: KioskDevice): Promise<void> {
    this.refreshing.set(device.id)
    try {
      await this.$devices.refreshDevice(device)
      this.$toastr.success(this.$translate.instant('kiosk.tablets.refreshed', { name: device.name }), this.$translate.instant('toast.title_success'))
      void this.reload()
    } catch (error) {
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    } finally {
      this.refreshing.set(null)
    }
  }

  protected async revoke(device: KioskDevice): Promise<void> {
    const injector = createEnvironmentInjector([
      {
        provide: CONFIRM_MODAL_DATA,
        useValue: {
          title: this.$translate.instant('kiosk.tablets.revoke_title', { name: device.name }),
          message: this.$translate.instant('kiosk.tablets.revoke_message'),
          confirmButtonLabel: this.$translate.instant('kiosk.tablets.revoke_button'),
          confirmButtonClass: 'btn-danger',
          faIconClass: 'fas fa-ban danger-text',
        },
      },
    ], this.$injector)

    const ref = this.$modal.open(ConfirmComponent, { backdrop: 'static', injector })
    try {
      await ref.result
    } catch {
      return
    }
    try {
      await this.$devices.remove(device.id)
      this.$toastr.success(this.$translate.instant('kiosk.tablets.revoked', { name: device.name }), this.$translate.instant('toast.title_success'))
      void this.reload()
    } catch (error) {
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    }
  }

  /** "5 minutes ago", in the browser's language */
  protected lastSeen(device: KioskDevice): string {
    if (!device.lastSeenAt) {
      return this.$translate.instant('kiosk.tablets.never')
    }
    const seconds = Math.round((Date.parse(device.lastSeenAt) - Date.now()) / 1000)
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
    ]
    const formatter = new Intl.RelativeTimeFormat(this.$translate.currentLang() || undefined, { numeric: 'auto' })
    for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size) {
        return formatter.format(Math.round(seconds / size), unit)
      }
    }
    return formatter.format(seconds, 'second')
  }
}
