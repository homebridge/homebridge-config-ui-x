import { AuthService } from '@/app/core/auth/auth.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { Component, Input, OnDestroy, OnInit } from '@angular/core'
import { interval, Subscription } from 'rxjs'

@Component({
  templateUrl: './uptime-widget.component.html',
})
export class UptimeWidgetComponent implements OnInit, OnDestroy {
  @Input() widget: any

  public serverUptime: string
  public processUptime: string

  private io: IoNamespace
  private intervalSubscription: Subscription

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
  ) {}

  ngOnInit() {
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

  getServerUptimeInfo() {
    this.io.request('get-server-uptime-info').subscribe((data) => {
      this.serverUptime = this.humaniseDuration(data.time.uptime)
      this.processUptime = this.humaniseDuration(data.processUptime)
    })
  }

  humaniseDuration(seconds: number) {
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

  ngOnDestroy() {
    this.intervalSubscription.unsubscribe()
  }
}
