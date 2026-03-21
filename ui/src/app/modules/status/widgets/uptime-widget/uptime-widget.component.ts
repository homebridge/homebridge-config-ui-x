import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslatePipe } from '@ngx-translate/core'
import { interval } from 'rxjs'

import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './uptime-widget.component.html',
  standalone: true,
  imports: [TranslatePipe],
})
export class UptimeWidgetComponent implements OnInit {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $ws = inject(WsService)

  // Signals
  widget = input.required<Widget>()
  public serverUptime = signal<string>('')
  public processUptime = signal<string>('')

  // Other properties
  private io: IoNamespace

  public ngOnInit(): void {
    this.io = this.$ws.getExistingNamespace('status')

    this.io.connected.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.getServerUptimeInfo()
    })

    interval(11000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.io.socket.connected) {
        this.getServerUptimeInfo()
      }
    })

    // Fetch initial data if already connected
    if (this.io.socket.connected) {
      this.getServerUptimeInfo()
    }
  }

  private getServerUptimeInfo(): void {
    this.io.request('get-server-uptime-info').subscribe((data) => {
      this.serverUptime.set(this.humaniseDuration(data.time.uptime))
      this.processUptime.set(this.humaniseDuration(data.processUptime))
    })
  }

  private humaniseDuration(seconds: number): string {
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
