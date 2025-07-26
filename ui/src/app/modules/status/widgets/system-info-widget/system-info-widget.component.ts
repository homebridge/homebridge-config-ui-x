import { NgClass, TitleCasePipe } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { IoNamespace, WsService } from '@/app/core/ws.service'

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

  @Input() widget: any

  public serverInfo: any
  public nodejsInfo = {} as any

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
