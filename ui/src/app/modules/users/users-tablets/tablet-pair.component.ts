import type { KioskDevice, PairingCode } from '@/app/modules/kiosk/kiosk-devices.service'

import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { KioskDevicesService } from '@/app/modules/kiosk/kiosk-devices.service'

/** The page a tablet opens to pair, with the code in the link so the QR code needs no typing */
export function pairingUrl(code: string): string {
  const url = new URL('kiosk/pair', document.baseURI)
  url.searchParams.set('code', code)
  return url.toString()
}

/** Shows a fresh pairing code for a tablet, as text and as a QR code, with a countdown to its expiry */
@Component({
  selector: 'app-tablet-pair',
  imports: [
    QrcodeComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './tablet-pair.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabletPairComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $devices = inject(KioskDevicesService)
  private $errors = inject(HttpErrorService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $destroyRef = inject(DestroyRef)

  /** Set by the opener: the tablet to pair */
  public device!: KioskDevice

  protected readonly loading = signal(false)
  protected readonly pairing = signal<PairingCode | null>(null)
  protected readonly now = signal(Date.now())
  protected readonly remainingMs = computed(() => {
    const pairing = this.pairing()
    return pairing
      ? Math.max(0, Date.parse(pairing.expiresAt) - this.now())
      : 0
  })

  protected readonly expired = computed(() => !!this.pairing() && this.remainingMs() === 0)
  protected readonly countdown = computed(() => {
    const seconds = Math.ceil(this.remainingMs() / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  })

  protected readonly url = computed(() => {
    const pairing = this.pairing()
    return pairing
      ? pairingUrl(pairing.code)
      : ''
  })

  public ngOnInit(): void {
    const timer = setInterval(() => this.now.set(Date.now()), 1000)
    this.$destroyRef.onDestroy(() => clearInterval(timer))
    void this.newCode()
  }

  protected async newCode(): Promise<void> {
    this.loading.set(true)
    try {
      this.pairing.set(await this.$devices.pairingCode(this.device.id))
      this.now.set(Date.now())
    } catch (error) {
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    } finally {
      this.loading.set(false)
    }
  }

  protected close(): void {
    this.$activeModal.close()
  }
}
