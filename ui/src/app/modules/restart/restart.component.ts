/* global NodeJS */
import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { NgClass } from '@angular/common'
import { Component, inject, OnDestroy, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './restart.component.html',
  styleUrls: ['./restart.component.scss'],
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class RestartComponent implements OnInit, OnDestroy {
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  checkTimeout: NodeJS.Timeout
  checkDelay: NodeJS.Timeout
  resp: any = {}
  timeout = false
  error: any = false
  public uiOnline = false

  private io: IoNamespace

  ngOnInit() {
    this.io = this.$ws.connectToNamespace('status')
    this.io.connected.subscribe(() => {
      this.io.socket.emit('monitor-server-status')
      this.$settings.getAppSettings().catch(/* do nothing */)
    })

    this.$api.put('/server/restart', {}).subscribe({
      next: (data) => {
        this.resp = data
        this.checkIfServerUp()
        if (!data.restartingUI) {
          this.uiOnline = true
        }
      },
      error: (error) => {
        console.error(error)
        this.error = this.$translate.instant('restart.toast_server_restart_error')
        this.$toastr.error(this.$translate.instant('restart.toast_server_restart_error'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  checkIfServerUp() {
    this.checkDelay = setTimeout(() => {
      // listen to homebridge-status events to see when it's back online
      this.io.socket.on('homebridge-status', (data) => {
        this.uiOnline = true
        if (data.status === 'up' || data.status === 'pending') {
          this.$toastr.success(this.$translate.instant('restart.toast_server_restarted'), this.$translate.instant('toast.title_success'))
          this.$router.navigate(['/'])
        }
      })
    }, 7000)

    this.checkTimeout = setTimeout(() => {
      this.$toastr.warning(
        this.$translate.instant('restart.toast_server_restart_timeout'),
        this.$translate.instant('toast.title_warning'),
        {
          timeOut: 10000,
        },
      )
      this.timeout = true
    }, 40000)
  }

  viewLogs() {
    this.$router.navigate(['/logs'])
  }

  ngOnDestroy() {
    this.io.end()

    clearTimeout(this.checkDelay)
    clearTimeout(this.checkTimeout)
  }
}
