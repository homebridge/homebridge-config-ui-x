import { NgClass, TitleCasePipe } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { IoNamespace, WsService } from '@/app/core/ws.service'
import { NodeJsInfo, ServerInfo, Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './system-info-widget.component.html',
  styleUrls: ['./system-info-widget.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TitleCasePipe,
    TranslatePipe,
  ],
})
export class SystemInfoWidgetComponent implements OnInit {
  private $ws = inject(WsService)
  private io: IoNamespace

  @Input() widget: Widget

  public serverInfo: ServerInfo = { network: {}, os: {}, time: {} } as ServerInfo
  public nodejsInfo: NodeJsInfo = {} as NodeJsInfo

  public ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')
    this.io.connected.subscribe(async () => {
      this.getSystemInfo()
    })

    if (this.io.socket.connected) {
      this.getSystemInfo()
    }
  }

  private getSystemInfo() {
    this.io.request('get-homebridge-server-info').subscribe((data) => {
      this.serverInfo = data
    })

    this.io.request('nodejs-version-check').subscribe((data) => {
      this.nodejsInfo = data
    })
  }
}
