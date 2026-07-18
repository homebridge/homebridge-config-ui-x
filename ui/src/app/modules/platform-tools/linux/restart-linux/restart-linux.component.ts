import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { timer } from 'rxjs'

import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { HomebridgeStatusResponse } from '@/app/core/server.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-restart-linux',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './restart-linux.component.html',
  styleUrl: './restart-linux.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestartLinuxComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private destroyRef = inject(DestroyRef)

  // Other properties
  private io!: IoNamespace
  private readonly statusCheckActive = signal(false)

  // Named handler so ngOnDestroy can detach it from the shared, cached
  // `status` socket — `io.end()` deliberately leaves listeners in place
  // (the namespace is shared across components), so without an explicit
  // `off` this closure survives navigation and every later
  // `homebridge-status` event re-toasts "Server Restarted" and yanks the
  // user back to the home page from wherever they are.
  private statusHandler = (data: HomebridgeStatusResponse) => {
    if (!this.statusCheckActive()) {
      return
    }
    if (data.status === 'ok' || data.status === 'pending') {
      // Latch so further `homebridge-status` events don't re-toast
      // while router navigation is in flight (screen readers re-read).
      this.statusCheckActive.set(false)
      this.$toastr.success(
        this.$translate.instant('platform.linux.server_restarted'),
        this.$translate.instant('toast.title_success'),
      )
      void this.$router.navigate(['/'])
    }
  }

  // Signals
  public readonly timeout = signal(false)
  public readonly error = signal<string | false>(false)

  public ngOnInit(): void {
    void this.initialize()
  }

  private async initialize(): Promise<void> {
    this.io = this.$ws.connectToNamespace('status')

    // Subscribe for reconnections. Bound to the component lifecycle — the
    // user can navigate away before the host comes back, and without
    // takeUntilDestroyed the callback would keep firing on a destroyed
    // component closure.
    this.io.connected!
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.io.socket.emit('monitor-server-status')
        void this.$settings.getAppSettings().catch(() => { /* do nothing */ })
      })

    // Set up socket listener for homebridge status updates
    this.io.socket.on('homebridge-status', this.statusHandler)

    try {
      await this.$api.put('/platform-tools/linux/restart-host', {})
      this.checkIfServerUp()
    } catch (error) {
      console.error(error)
      this.error.set(this.$translate.instant('platform.linux.server_restart_error'))
      this.$toastr.error(this.$translate.instant('platform.linux.server_restart_error'), this.$translate.instant('toast.title_error'))
    }
  }

  public ngOnDestroy() {
    this.io.socket.off('homebridge-status', this.statusHandler)
    this.statusCheckActive.set(false)
    this.io.end?.()
  }

  private checkIfServerUp() {
    timer(30000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Activate status checking - the socket listener will now respond to events
        this.statusCheckActive.set(true)

        // Request a fresh status in case the server restarted quickly and we missed the initial event
        this.io.socket.emit('monitor-server-status')
      })

    timer(120000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.$toastr.warning(
          this.$translate.instant('platform.linux.server_taking_long_time'),
          this.$translate.instant('toast.title_warning'),
          {
            timeOut: 10000,
          },
        )
        this.timeout.set(true)
      })
  }
}
