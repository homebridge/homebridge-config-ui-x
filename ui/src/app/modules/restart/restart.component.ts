import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core'
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
  selector: 'app-restart',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './restart.component.html',
  styleUrl: './restart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestartComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private destroyRef = inject(DestroyRef)

  // Signals
  public readonly uiOnline = signal(false)
  public readonly error = signal<string | false>(false)
  public readonly resp = signal<Record<string, unknown>>({})
  public readonly timeout = signal(false)

  // Computed signals for icon classes
  public readonly uiIcon = computed(() => this.uiOnline() ? 'far fa-check-circle' : 'fas fa-circle-notch fa-spin')
  public readonly serviceIcon = computed(() => this.uiOnline() ? 'fas fa-circle-notch fa-spin' : 'far fa-circle')

  // Other properties
  private io!: IoNamespace
  private readonly statusCheckActive = signal(false)

  // Lifecycle
  public ngOnInit(): void {
    this.io = this.$ws.connectToNamespace('status')

    // Subscribe for reconnections
    this.io.connected!.subscribe(() => {
      this.io.socket.emit('monitor-server-status')
      this.$settings.getAppSettings().catch(() => { /* do nothing */ })
    })

    // Check if already connected and initialize immediately
    if (this.io.socket.connected) {
      this.io.socket.emit('monitor-server-status')
      this.$settings.getAppSettings().catch(() => { /* do nothing */ })
    }

    // Set up socket listener for homebridge status updates
    this.io.socket.on('homebridge-status', (data: HomebridgeStatusResponse) => {
      if (this.statusCheckActive()) {
        this.uiOnline.set(true)
        if (data.status === 'ok' || data.status === 'pending') {
          this.$toastr.success(this.$translate.instant('restart.toast_server_restarted'), this.$translate.instant('toast.title_success'))
          void this.$router.navigate(['/'])
        }
      }
    })

    // Some custom flow can be run via the use of query params
    const queryParams = this.$router.parseUrl(this.$router.url).queryParams

    // (1) Actions like accessory cache removal have already started the restart process, so we don't need to do it again
    const restarting = queryParams.restarting === 'true'

    if (restarting) {
      this.uiOnline.set(true)
      this.checkIfServerUp()
    } else {
      void this.performRestart()
    }
  }

  public ngOnDestroy(): void {
    this.io.end?.()
    this.statusCheckActive.set(false)
  }

  // Public methods
  public viewLogs(): void {
    void this.$router.navigate(['/logs'])
  }

  // Private methods
  private async performRestart(): Promise<void> {
    // Perform the restart
    try {
      const data = await this.$api.put('/server/restart', {})
      this.resp.set(data)
      this.checkIfServerUp()
      if (!data.restartingUI) {
        this.uiOnline.set(true)
      }
    } catch (restartError) {
      console.error(restartError)
      this.error.set(this.$translate.instant('restart.toast_server_restart_error'))
      this.$toastr.error(this.$translate.instant('restart.toast_server_restart_error'), this.$translate.instant('toast.title_error'))
    }
  }

  private checkIfServerUp(): void {
    // Activate status checking - the socket listener will now respond to events
    timer(7000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.statusCheckActive.set(true)

        // Request a fresh status in case the server restarted quickly and we missed the initial event
        this.io.socket.emit('monitor-server-status')
      })

    // Set up timeout warning
    timer(40000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.$toastr.warning(
          this.$translate.instant('restart.toast_server_restart_timeout'),
          this.$translate.instant('toast.title_warning'),
          {
            timeOut: 10000,
          },
        )
        this.timeout.set(true)
      })
  }
}
