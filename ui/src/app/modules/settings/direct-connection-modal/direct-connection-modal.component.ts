import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'

export type DirectConnectionVariant = 'named' | 'quick'

export interface DirectConnectionStatus {
  supported: boolean
  blockedReason: 'auth-disabled' | null
  insecureMode: boolean
  enabled: boolean
  variant: DirectConnectionVariant
  hostname: string
  tunnelId: string | null
  loggedIn: boolean
  loginInProgress: boolean
  loginUrl: string | null
  state: 'stopped' | 'starting' | 'connected' | 'reconnecting' | 'error'
  publicUrl: string | null
  lastError: string | null
}

// Lower-case FQDN with at least one dot, matching the server-side check
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

const POLL_INTERVAL_MS = 3000

@Component({
  selector: 'app-direct-connection-modal',
  imports: [TranslatePipe, ReactiveFormsModule],
  standalone: true,
  templateUrl: './direct-connection-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectConnectionModalComponent implements OnInit {
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private destroyRef = inject(DestroyRef)
  public $activeModal = inject(NgbActiveModal)

  private readonly endpoint = '/settings/direct-connection'
  private pollTimer: ReturnType<typeof setInterval> | null = null

  public readonly status = signal<DirectConnectionStatus | null>(null)
  public readonly loadFailed = signal(false)
  public readonly busy = signal(false)

  public variantControl = new FormControl<DirectConnectionVariant>('named', { nonNullable: true })
  public hostnameControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [
      Validators.pattern(HOSTNAME_PATTERN),
    ],
  })

  // Bumped on every form change so computed() sees FormControl updates
  private readonly formRevision = signal(0)

  public readonly isBlocked = computed(() => {
    const status = this.status()
    return !status || !status.supported || status.blockedReason !== null
  })

  public readonly canConnect = computed(() => {
    this.formRevision()
    const status = this.status()
    if (!status || this.isBlocked() || status.enabled || this.busy()) {
      return false
    }
    if (this.variantControl.value === 'quick') {
      return true
    }
    return status.loggedIn && !!this.hostnameControl.value && this.hostnameControl.valid
  })

  constructor() {
    this.destroyRef.onDestroy(() => this.stopPolling())
  }

  ngOnInit() {
    this.variantControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formRevision.update(n => n + 1))
    this.hostnameControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formRevision.update(n => n + 1))
    void this.refresh(true)
  }

  public async refresh(syncForm = false) {
    try {
      const status = await this.$api.get<DirectConnectionStatus>(this.endpoint)
      this.apply(status, syncForm)
      this.loadFailed.set(false)
    } catch (error) {
      console.error(error)
      this.loadFailed.set(true)
      this.stopPolling()
    }
  }

  public async signIn() {
    // Open the tab now, while we still have the click, so pop-up blockers
    // allow it; it is pointed at the Cloudflare link once we have it.
    const tab = window.open('', '_blank')
    const status = await this.run(() => this.$api.post<DirectConnectionStatus>(`${this.endpoint}/login`, {}))
    if (status?.loginUrl && tab) {
      tab.opener = null
      tab.location.href = status.loginUrl
    } else {
      tab?.close()
    }
  }

  public async signOut() {
    await this.run(() => this.$api.post<DirectConnectionStatus>(`${this.endpoint}/logout`, {}), true)
  }

  public async connect() {
    const saved = await this.run(() => this.$api.put<DirectConnectionStatus>(this.endpoint, {
      variant: this.variantControl.value,
      hostname: this.variantControl.value === 'named'
        ? this.hostnameControl.value.trim().toLowerCase()
        : undefined,
    }))
    if (saved) {
      await this.run(() => this.$api.post<DirectConnectionStatus>(`${this.endpoint}/connect`, {}))
    }
  }

  public async disconnect() {
    await this.run(() => this.$api.post<DirectConnectionStatus>(`${this.endpoint}/disconnect`, {}))
  }

  private async run(request: () => Promise<DirectConnectionStatus>, syncForm = false): Promise<DirectConnectionStatus | null> {
    this.busy.set(true)
    try {
      const status = await request()
      this.apply(status, syncForm)
      return status
    } catch (error: any) {
      console.error(error)
      const message = error?.error?.message || this.$translate.instant('settings.direct_connection.error_generic')
      await this.refresh()
      // Tunnel failures are already shown in the status panel; don't repeat them
      if (this.status()?.lastError !== message) {
        this.$toastr.error(message, this.$translate.instant('toast.title_error'))
      }
      return null
    } finally {
      this.busy.set(false)
    }
  }

  private apply(status: DirectConnectionStatus, syncForm: boolean) {
    const previous = this.status()
    this.status.set(status)

    if (syncForm || status.enabled) {
      this.variantControl.setValue(status.variant, { emitEvent: false })
      this.hostnameControl.setValue(status.hostname, { emitEvent: false })
    }
    if (status.enabled || this.isBlocked()) {
      this.variantControl.disable({ emitEvent: false })
      this.hostnameControl.disable({ emitEvent: false })
    } else {
      this.variantControl.enable({ emitEvent: false })
      this.hostnameControl.enable({ emitEvent: false })
    }
    this.formRevision.update(n => n + 1)

    if (previous && !previous.loggedIn && status.loggedIn) {
      this.$toastr.success(this.$translate.instant('settings.direct_connection.signed_in'), this.$translate.instant('toast.title_success'))
    }

    // Keep polling while something is changing in the background
    const settling = status.loginInProgress || (status.enabled && ['starting', 'reconnecting'].includes(status.state))
    if (settling) {
      this.startPolling()
    } else {
      this.stopPolling()
    }
  }

  private startPolling() {
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS)
    }
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }
}
