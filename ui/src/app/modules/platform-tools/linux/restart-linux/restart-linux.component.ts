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

  // Signals
  public readonly timeout = signal(false)
  public readonly error = signal<string | false>(false)

  public ngOnInit(): void {
    void this.initialize()
  }

  private async initialize(): Promise<void> {
    this.io = this.$ws.connectToNamespace('status')

    // Subscribe for reconnections
    this.io.connected!.subscribe(() => {
      this.io.socket.emit('monitor-server-status')
      void this.$settings.getAppSettings().catch(() => { /* do nothing */ })
    })

    // Check if already connected and initialize immediately
    if (this.io.socket.connected) {
      this.io.socket.emit('monitor-server-status')
      void this.$settings.getAppSettings().catch(() => { /* do nothing */ })
    }

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
    this.io.end?.()
  }

  private checkIfServerUp() {
    timer(30000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Listen to homebridge-status events to see when it's back online
        this.io.socket.on('homebridge-status', (data: HomebridgeStatusResponse) => {
          if (data.status === 'ok' || data.status === 'pending') {
            this.$toastr.success(
              this.$translate.instant('platform.linux.server_restarted'),
              this.$translate.instant('toast.title_success'),
            )
            void this.$router.navigate(['/'])
          }
        })
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
