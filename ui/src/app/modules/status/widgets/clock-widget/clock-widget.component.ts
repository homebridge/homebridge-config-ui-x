import { Component, Input, OnDestroy, OnInit } from '@angular/core'
import { interval, Subscription } from 'rxjs'

@Component({
  templateUrl: './clock-widget.component.html',
})
export class ClockWidgetComponent implements OnInit, OnDestroy {
  @Input() widget: any

  public currentTime: Date = new Date()

  private secondsCounter = interval(1000)
  private secondsCounterSubscription: Subscription

  constructor() {}

  ngOnInit() {
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

  ngOnDestroy() {
    this.secondsCounterSubscription.unsubscribe()
  }
}
