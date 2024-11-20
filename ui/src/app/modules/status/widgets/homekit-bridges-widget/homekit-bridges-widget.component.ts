import { ApiService } from '@/app/core/api.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { NgClass } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './homekit-bridges-widget.component.html',
  styleUrls: ['./homekit-bridges-widget.component.scss'],
  imports: [
    NgClass,
    NgbTooltip,
    TranslatePipe,
  ],
})
export class HomekitBridgesWidgetComponent implements OnInit, OnDestroy {
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  @Input() widget: any

  public homebridgeStatus = {} as any
  public childBridges = []

  private ioMain: IoNamespace
  private ioChild: IoNamespace

  async ngOnInit(): Promise<void> {
    this.ioMain = this.$ws.getExistingNamespace('status')
    this.ioMain.socket.on('homebridge-status', (data) => {
      this.homebridgeStatus = data
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
      } else {
        this.childBridges.push(data)
      }
    })
  }

  async getHomebridgeStatus() {
    this.homebridgeStatus = await firstValueFrom(this.ioMain.request('get-homebridge-status'))
  }

  getChildBridgeMetadata() {
    this.ioChild.request('get-homebridge-child-bridge-status').subscribe((data) => {
      this.childBridges = data
    })
  }

  async restartChildBridge(bridge: any) {
    try {
      await firstValueFrom(this.ioChild.request('restart-child-bridge', bridge.username))
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('status.widget.bridge.restart_error'), this.$translate.instant('toast.title_error'))
    }
  }

  restartHomebridge() {
    this.$api.put('/server/restart', {}).subscribe({
      error: (error: any) => {
        console.error(error)
        this.$toastr.error(this.$translate.instant('restart.toast_server_restart_error'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  ngOnDestroy(): void {
    this.ioMain.end()
    this.ioChild.end()
  }
}
