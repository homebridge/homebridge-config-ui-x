import { NgClass } from '@angular/common'
import { Component, DestroyRef, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
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
  private $destroyRef = inject(DestroyRef)
  private $ws = inject(WsService)
  private io: IoNamespace
  private intervalSubscription: Subscription

  @Input() widget: Widget

  public serverUptime: string
  public processUptime: string

  public ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')
    this.io.connected
      .pipe(takeUntilDestroyed(this.$destroyRef))
      .subscribe(async () => {
        this.getServerUptimeInfo()
      })

    if (this.io.socket.connected) {
      this.getServerUptimeInfo()
    }

    this.intervalSubscription = interval(11000)
      .pipe(takeUntilDestroyed(this.$destroyRef))
      .subscribe(() => {
        if (this.io.socket.connected) {
          this.getServerUptimeInfo()
        }
      })
  }

  public ngOnDestroy() {
    this.intervalSubscription.unsubscribe()
  }

  private getServerUptimeInfo() {
    this.io.request('get-server-uptime-info')
      .pipe(takeUntilDestroyed(this.$destroyRef))
      .subscribe((data) => {
        this.serverUptime = this.humaniseDuration(data.time.uptime)
        this.processUptime = this.humaniseDuration(data.processUptime)
      })
  }

  private humaniseDuration(totalSeconds: number): string {
    const showDays = this.widget?.uptimeShowDays
    const showHours = this.widget?.uptimeShowHours
    const showMinutes = this.widget?.uptimeShowMinutes
    const showSeconds = this.widget?.uptimeShowSeconds

    let seconds = Math.floor(totalSeconds)
    const days = Math.floor(seconds / 86400)
    seconds -= days * 86400
    const hours = Math.floor(seconds / 3600)
    seconds -= hours * 3600
    const minutes = Math.floor(seconds / 60)
    seconds -= minutes * 60

    // If nothing is picked, default to days
    if (!showDays && !showHours && !showMinutes && !showSeconds) {
      return `${Math.floor(totalSeconds / 86400)}d`
    }

    // Only one unit: show total for that unit
    if (showDays && !showHours && !showMinutes && !showSeconds) {
      return `${Math.floor(totalSeconds / 86400)}d`
    }
    if (!showDays && showHours && !showMinutes && !showSeconds) {
      return `${Math.floor(totalSeconds / 3600)}h`
    }
    if (!showDays && !showHours && showMinutes && !showSeconds) {
      return `${Math.floor(totalSeconds / 60)}m`
    }
    if (!showDays && !showHours && !showMinutes && showSeconds) {
      return `${Math.floor(totalSeconds)}s`
    }

    // Build string for any combination (split units)
    const parts: string[] = []
    if (showDays)
      parts.push(`${days}d`)
    if (showHours)
      parts.push(`${hours}h`)
    if (showMinutes)
      parts.push(`${minutes}m`)
    if (showSeconds)
      parts.push(`${seconds}s`)
    return parts.join(' ')
  }
}
