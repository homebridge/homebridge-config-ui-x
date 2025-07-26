import { NgClass } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { interval, Subscription } from 'rxjs'

import { IoNamespace, WsService } from '@/app/core/ws.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './uptime-widget.component.html',
  standalone: true,
  imports: [NgClass, TranslatePipe],
})
export class UptimeWidgetComponent implements OnInit, OnDestroy {
  private $ws = inject(WsService)
  private io: IoNamespace
  private intervalSubscription: Subscription

  @Input() widget: Widget

  public serverUptime: string
  public processUptime: string

  public ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')
    this.io.connected.subscribe(async () => {
      this.getServerUptimeInfo()
    })

    if (this.io.socket.connected) {
      this.getServerUptimeInfo()
    }

    this.intervalSubscription = interval(11000).subscribe(() => {
      if (this.io.socket.connected) {
        this.getServerUptimeInfo()
      }
    })
  }

  public ngOnDestroy() {
    this.intervalSubscription.unsubscribe()
  }

  private getServerUptimeInfo() {
    this.io.request('get-server-uptime-info').subscribe((data) => {
      this.serverUptime = this.humaniseDuration(data.time.uptime)
      this.processUptime = this.humaniseDuration(data.processUptime)
    })
  }

  private humaniseDuration(seconds: number) {
    if (seconds < 50) {
      return '< 1m'
    }
    if (seconds < 3600) {
      return `${Math.round((seconds / 60))}m`
    }
    if (seconds < 86400) {
      return `${Math.round((seconds / 60 / 60))}h`
    }
    return `${Math.floor((seconds / 60 / 60 / 24))}d`
  }
}
