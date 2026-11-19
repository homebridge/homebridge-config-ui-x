import { HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'

import { KioskDeviceService, saveStoredDevice } from './kiosk-device.service'

/** Codes are shown in capitals, so whatever the user types or the QR link carries is tidied to match */
function normaliseCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

/**
 * Pair this tablet with a kiosk view. Public (no sign-in): the admin's pairing code, typed or read from the QR link,
 * is exchanged for a token that is kept in this browser only.
 */
@Component({
  selector: 'app-kiosk-pair',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './kiosk-pair.component.html',
  styleUrl: './kiosk.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KioskPairComponent implements OnInit {
  private $route = inject(ActivatedRoute)
  private $router = inject(Router)
  private $device = inject(KioskDeviceService)

  protected readonly code = signal('')
  protected readonly busy = signal(false)
  /** Translation key of the problem to show, or empty */
  protected readonly error = signal('')

  public ngOnInit(): void {
    const fromLink = this.$route.snapshot.queryParamMap.get('code')
    if (fromLink) {
      this.code.set(normaliseCode(fromLink))
    }
  }

  protected onCodeInput(event: Event): void {
    this.code.set(normaliseCode((event.target as HTMLInputElement).value))
    this.error.set('')
  }

  protected async submit(): Promise<void> {
    const code = this.code()
    if (!code || this.busy()) {
      return
    }
    this.busy.set(true)
    this.error.set('')
    try {
      const paired = await this.$device.pair(code)
      if (!saveStoredDevice({ token: paired.token, deviceId: paired.device.id })) {
        this.error.set('kiosk.pair.storage_error')
        return
      }
      await this.$router.navigateByUrl('/kiosk/device')
    } catch (error) {
      const rejected = error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500
      this.error.set(rejected ? 'kiosk.pair.invalid' : 'kiosk.pair.failed')
    } finally {
      this.busy.set(false)
    }
  }
}
