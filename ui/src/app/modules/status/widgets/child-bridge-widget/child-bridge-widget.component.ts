import { IoNamespace, WsService } from '@/app/core/ws.service'
import { Component, Input, OnDestroy, OnInit } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './child-bridge-widget.component.html',
  styleUrls: ['./child-bridge-widget.component.scss'],
})
export class ChildBridgeWidgetComponent implements OnInit, OnDestroy {
  @Input() widget: any

  public childBridges = []

  private io: IoNamespace

  constructor(
    private $toastr: ToastrService,
    private $translate: TranslateService,
    private $ws: WsService,
  ) {}

  ngOnInit(): void {
    this.io = this.$ws.connectToNamespace('child-bridges')
    this.io.connected.subscribe(async () => {
      this.getChildBridgeMetadata()
      this.io.socket.emit('monitor-child-bridge-status')
    })

    this.io.socket.on('child-bridge-status-update', (data: any) => {
      const existingBridge = this.childBridges.find(x => x.username === data.username)
      if (existingBridge) {
        Object.assign(existingBridge, data)
      } else {
        this.childBridges.push(data)
      }
    })
  }

  getChildBridgeMetadata() {
    this.io.request('get-homebridge-child-bridge-status').subscribe((data) => {
      this.childBridges = data
    })
  }

  async restartChildBridge(bridge: any) {
    bridge.restartInProgress = true
    try {
      await firstValueFrom(this.io.request('restart-child-bridge', bridge.username))
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('status.widget.bridge.restart_error'), this.$translate.instant('toast.title_error'))
      bridge.restartInProgress = false
    } finally {
      setTimeout(() => {
        bridge.restartInProgress = false
      }, 12000)
    }
  }

  ngOnDestroy(): void {
    this.io.end()
  }
}
