import { NgClass } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './bridges-widget.component.html',
  styleUrls: ['./bridges-widget.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    NgbTooltip,
    TranslatePipe,
  ],
})
export class BridgesWidgetComponent implements OnInit, OnDestroy {
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private ioMain: IoNamespace
  private ioChild: IoNamespace

  @Input() widget: Widget

  public homebridgeStatus = {} as any
  public childBridges = []
  public isRestarting = false
  public isAdmin = this.$auth.user.admin

  public async ngOnInit(): Promise<void> {
    this.ioMain = this.$ws.getExistingNamespace('status')
    this.ioMain.socket.on('homebridge-status', (data) => {
      this.homebridgeStatus = data
      if (data.status === 'up') {
        this.isRestarting = false
      }
    })
    this.ioMain.connected.subscribe(async () => {
      await this.getHomebridgeStatus()
    })
    if (this.ioMain.socket.connected) {
      await this.getHomebridgeStatus()
    }
    this.ioMain.socket.on('disconnect', () => {
      this.homebridgeStatus.status = 'down'
    })

    this.ioChild = this.$ws.connectToNamespace('child-bridges')
    this.ioChild.connected.subscribe(async () => {
      this.getChildBridgeMetadata()
      this.ioChild.socket.emit('monitor-child-bridge-status')
    })
    this.ioChild.socket.on('child-bridge-status-update', (data: any) => {
      const existingBridge = this.childBridges.find(x => x.username === data.username)
      if (existingBridge) {
        Object.assign(existingBridge, data)
        if (data.status === 'ok') {
          existingBridge.restarting = false
        }
      } else {
        this.childBridges.push(data)
        this.childBridges.sort((a, b) => a.name.localeCompare(b.name))
      }
    })
  }

  public async restartChildBridge(bridge: any) {
    try {
      bridge.restarting = true
      await firstValueFrom(this.ioChild.request('restart-child-bridge', bridge.username))
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('status.widget.bridge.restart_error'), this.$translate.instant('toast.title_error'))
    } finally {
      setTimeout(() => {
        bridge.restarting = false
      }, 15000)
    }
  }

  public restartHomebridge() {
    this.isRestarting = true
    this.$api.put('/server/restart', {}).subscribe({
      error: (error: any) => {
        console.error(error)
        this.$toastr.error(this.$translate.instant('restart.toast_server_restart_error'), this.$translate.instant('toast.title_error'))
      },
    })
    setTimeout(() => {
      this.isRestarting = false
    }, 15000)
  }

  public ngOnDestroy(): void {
    this.ioMain.end()
    this.ioChild.end()
  }

  private async getHomebridgeStatus() {
    this.homebridgeStatus = await firstValueFrom(this.ioMain.request('get-homebridge-status'))
  }

  private getChildBridgeMetadata() {
    this.ioChild.request('get-homebridge-child-bridge-status').subscribe((data) => {
      this.childBridges = data
      this.childBridges = data.sort((a, b) => a.name.localeCompare(b.name))
    })
  }
}
