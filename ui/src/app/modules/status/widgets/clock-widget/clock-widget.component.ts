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
  public currentDate = this.currentTime.toLocaleDateString();

  constructor() { }

  ngOnInit() {
    if (!this.widget.timeFormat) {
      this.widget.timeFormat = 'H:mm';
    }

    this.secondsCounterSubscription = this.secondsCounter.subscribe(() => {
      this.currentTime = new Date();
      this.currentDate = this.currentTime.toLocaleDateString();
    });
  }

  ngOnDestroy() {
    this.secondsCounterSubscription.unsubscribe();
  }

}
