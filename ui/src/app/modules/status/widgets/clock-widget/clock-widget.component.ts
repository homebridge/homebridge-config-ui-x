import { DatePipe } from '@angular/common'
import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { interval } from 'rxjs'

import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './clock-widget.component.html',
  standalone: true,
  imports: [DatePipe],
})
export class ClockWidgetComponent implements OnInit {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)

  // Signals
  widget = input.required<Widget>()
  public currentTime = signal<Date>(new Date())

  public ngOnInit(): void {
    if (!this.widget().timeFormat) {
      this.widget().timeFormat = 'H:mm'
    }
    if (!this.widget().dateFormat) {
      this.widget().dateFormat = 'yyyy-MM-dd'
    }

    interval(1000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.currentTime.set(new Date())
    })
  }
}
