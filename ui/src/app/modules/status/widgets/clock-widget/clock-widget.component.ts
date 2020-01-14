import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-clock-widget',
  templateUrl: './clock-widget.component.html',
  styleUrls: ['./clock-widget.component.scss'],
})
export class ClockWidgetComponent implements OnInit, OnDestroy {
  @Input() widget;

  private secondsCounter = interval(1000);
  private secondsCounterSubscription: Subscription;
  public currentTime: Date = new Date();

  constructor() { }

  ngOnInit() {
    if (!this.widget.timeFormat) {
      this.widget.timeFormat = 'H:mm';
    }
    if (!this.widget.dateFormat) {
      this.widget.dateFormat = 'yyyy-MM-dd';
    }

    this.secondsCounterSubscription = this.secondsCounter.subscribe(() => {
      this.currentTime = new Date();
    });
  }

  ngOnDestroy() {
    this.secondsCounterSubscription.unsubscribe();
  }

}
