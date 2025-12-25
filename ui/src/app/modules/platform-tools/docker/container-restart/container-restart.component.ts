/* global NodeJS */
import { Component, inject, OnDestroy, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/api.service'
import { HomebridgeStatusResponse } from '@/app/core/server.interfaces'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'

@Component({
  templateUrl: './container-restart.component.html',
  styleUrls: ['./container-restart.component.scss'],
  standalone: true,
  imports: [TranslatePipe],
})
export class ContainerRestartComponent implements OnInit, OnDestroy {
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private checkTimeout: NodeJS.Timeout
  private checkDelay: NodeJS.Timeout
  private io: IoNamespace

  public resp: any = {}
  public timeout = false
  public error: any = false
  public readonly command = '<span class="font-monospace">--restart=always</span>'

  public ngOnInit() {
    this.io = this.$ws.connectToNamespace('status')
    this.io.connected.subscribe(() => {
      this.io.socket.emit('monitor-server-status')
      this.$settings.getAppSettings().catch(() => { /* do nothing */ })
    })

    this.$api.put('/platform-tools/docker/restart-container', {}).subscribe({
      next: (data) => {
        this.resp = data
        this.checkIfServerUp()
      },
      error: (error) => {
        this.error = this.$translate.instant('restart.toast_server_restart_error')
        console.error(error)
        this.$toastr.error(this.$translate.instant('restart.toast_server_restart_error'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  public ngOnDestroy() {
    this.io.end()

    clearTimeout(this.checkDelay)
    clearTimeout(this.checkTimeout)
  }

  private checkIfServerUp() {
    this.checkDelay = setTimeout(() => {
      // Listen to homebridge-status events to see when it's back online
      this.io.socket.on('homebridge-status', (data: HomebridgeStatusResponse) => {
        if (data.status === 'ok' || data.status === 'pending') {
          this.$toastr.success(
            this.$translate.instant('platform.docker.container_restarted'),
            this.$translate.instant('toast.title_success'),
          )
          void this.$router.navigate(['/'])
        }
      })
    }, 10000)

    this.checkTimeout = setTimeout(() => {
      this.$toastr.warning(
        this.$translate.instant('restart.toast_server_restart_timeout'),
        this.$translate.instant('toast.title_warning'),
        {
          timeOut: 10000,
        },
      )
      this.timeout = true
    }, 60000)
  }
}
