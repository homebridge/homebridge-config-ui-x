import { DatePipe } from '@angular/common'
import { Component, Input, OnDestroy, OnInit } from '@angular/core'
import { interval, Subscription } from 'rxjs'

import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './clock-widget.component.html',
  standalone: true,
  imports: [DatePipe],
})
export class ClockWidgetComponent implements OnInit, OnDestroy {
  private secondsCounter = interval(1000)
  private secondsCounterSubscription: Subscription

  @Input() widget: Widget

  public currentTime: Date = new Date()

  public ngOnInit() {
    if (!this.widget.timeFormat) {
      this.widget.timeFormat = 'H:mm'
    }
    if (!this.widget.dateFormat) {
      this.widget.dateFormat = 'yyyy-MM-dd'
    }

    this.secondsCounterSubscription = this.secondsCounter.subscribe(() => {
      this.currentTime = new Date()
    })
  }

  public ngOnDestroy() {
    this.secondsCounterSubscription.unsubscribe()
  }
}
