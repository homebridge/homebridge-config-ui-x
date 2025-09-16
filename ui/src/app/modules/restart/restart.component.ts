/* global NodeJS */
import { NgClass } from '@angular/common'
import { Component, inject, isDevMode, OnDestroy, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'

@Component({
  templateUrl: './restart.component.html',
  styleUrls: ['./restart.component.scss'],
  standalone: true,
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
  private checkTimeout: NodeJS.Timeout
  private checkDelay: NodeJS.Timeout
  private io: IoNamespace
  private webrootChanged = false

  public uiOnline = false
  public error: any = false
  public resp: any = {}
  public timeout = false

  public ngOnInit() {
    this.io = this.$ws.connectToNamespace('status')
    this.io.connected.subscribe(() => {
      this.io.socket.emit('monitor-server-status')
      this.$settings.getAppSettings().catch(() => { /* do nothing */ })
    })

    // Some custom flow can be run via the use of query params
    const queryParams = this.$router.parseUrl(this.$router.url).queryParams

    // (1) Actions like accessory cache removal have already started the restart process, so we don't need to do it again
    const restarting = queryParams.restarting === 'true'

    if (restarting) {
      this.uiOnline = true
      this.checkIfServerUp()
    } else {
      void this.performRestart()
    }
  }

  public viewLogs() {
    void this.$router.navigate(['/logs'])
  }

  public ngOnDestroy() {
    this.io.end()

    clearTimeout(this.checkDelay)
    clearTimeout(this.checkTimeout)
  }

  private async performRestart() {
    try {
      // Check if webroot has changed and update index.html if needed
      const originalWebroot = this.$settings.originalWebroot || ''
      const currentWebroot = this.$settings.webroot || ''

      this.webrootChanged = originalWebroot !== currentWebroot && originalWebroot !== globalThis.webroot.errorCode

      if (this.webrootChanged) {
        // Update index.html with new webroot before restart
        await firstValueFrom(this.$api.put('/server/webroot', {
          webroot: currentWebroot,
        }))
      }

      // Perform the restart
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
    } catch (error) {
      console.error('Failed to update webroot:', error)
      // Fallback to normal restart even if webroot update fails
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
  }

  private checkIfServerUp() {
    this.checkDelay = setTimeout(() => {
      // Listen to homebridge-status events to see when it's back online
      this.io.socket.on('homebridge-status', (data) => {
        this.uiOnline = true
        if (data.status === 'up' || data.status === 'pending') {
          this.$toastr.success(this.$translate.instant('restart.toast_server_restarted'), this.$translate.instant('toast.title_success'))
          if (this.webrootChanged && !isDevMode()) {
            // Redirect to new webroot path (only in production)
            const normalizedWebroot = this.$settings.webroot?.replace(/^\/+|\/+$/g, '') || ''
            window.location.href = normalizedWebroot
              ? `/${normalizedWebroot}/`
              : '/'
          } else {
            void this.$router.navigate(['/'])
          }
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
}
