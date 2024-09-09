/* global NodeJS */
import { ApiService } from '@/app/core/api.service'
import { NotificationService } from '@/app/core/notification.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { Component, OnDestroy, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './restart.component.html',
  styleUrls: ['./restart.component.scss'],
})
export class RestartComponent implements OnInit, OnDestroy {
  checkTimeout: NodeJS.Timeout
  checkDelay: NodeJS.Timeout
  resp: any = {}
  timeout = false
  error: any = false
  public uiOnline = false

  private io: IoNamespace

  constructor(
    private $api: ApiService,
    private $ws: WsService,
    private $settings: SettingsService,
    private $notification: NotificationService,
    public $toastr: ToastrService,
    private translate: TranslateService,
    private $router: Router,
  ) {}

  ngOnInit() {
    this.io = this.$ws.connectToNamespace('status')
    this.$notification.restartTriggered.next(undefined)

    this.io.connected.subscribe(() => {
      this.io.socket.emit('monitor-server-status')
      this.$settings.getAppSettings().catch(/* do nothing */)
    })

    this.$api.put('/server/restart', {}).subscribe(
      (data) => {
        this.resp = data
        this.checkIfServerUp()
        if (!data.restartingUI) {
          this.uiOnline = true
        }
      },
      (err) => {
        const toastRestartError = this.translate.instant('restart.toast_server_restart_error')
        this.error = `${toastRestartError}.`
        this.$toastr.error(`${toastRestartError}: ${err.message}`, this.translate.instant('toast.title_error'))
      },
    )
  }

  checkIfServerUp() {
    this.checkDelay = setTimeout(() => {
      // listen to homebridge-status events to see when it's back online
      this.io.socket.on('homebridge-status', (data) => {
        this.uiOnline = true
        if (data.status === 'up' || data.status === 'pending') {
          this.$toastr.success(this.translate.instant('restart.toast_server_restarted'), this.translate.instant('toast.title_success'))
          this.$router.navigate(['/'])
        }
      })
    }, 7000)

    this.checkTimeout = setTimeout(() => {
      this.$toastr.warning(this.translate.instant('restart.toast_sever_restart_timeout'), this.translate.instant('toast.title_warning'), {
        timeOut: 10000,
      })
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
