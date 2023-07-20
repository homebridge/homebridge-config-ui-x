import { Component, OnInit, ViewChild, ElementRef, Input, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { ITerminalOptions } from 'xterm';

import { LogService } from '@/app/core/log.service';

@Component({
  selector: 'app-homebridge-logs-widget',
  templateUrl: './homebridge-logs-widget.component.html',
  styleUrls: ['./homebridge-logs-widget.component.scss'],
})
export class HomebridgeLogsWidgetComponent implements OnInit, OnDestroy {
  @ViewChild('widgetcontainer', { static: true }) widgetContainerElement: ElementRef;
  @ViewChild('terminaltitle', { static: true }) titleElement: ElementRef;
  @ViewChild('logoutput', { static: true }) termTarget: ElementRef;

  @Input() widget;
  @Input() resizeEvent: Subject<any>;
  @Input() configureEvent: Subject<any>;

  public terminalHeight = 200;

  private fontSize = 15;
  private fontWeight: ITerminalOptions['fontWeight'] = '400';

  constructor(
    private $log: LogService,
  ) { }

  ngOnInit() {
    this.fontSize = this.widget.fontSize || 15;
    this.fontWeight = this.widget.fontWeight || 400;

    setTimeout(() => {
      this.$log.startTerminal(this.termTarget, {
        cursorBlink: false,
        theme: {
          background: '#2b2b2b',
        },
        fontSize: this.fontSize,
        fontWeight: this.fontWeight,
      }, this.resizeEvent);
    });

    this.resizeEvent.subscribe({
      next: () => {
        this.terminalHeight = this.getTerminalHeight();
      },
    });

    this.configureEvent.subscribe({
      next: () => {
        if (this.widget.fontSize !== this.fontSize || this.widget.fontWeight !== this.fontWeight) {
          this.fontSize = this.widget.fontSize;
          this.fontWeight = this.widget.fontWeight;
          this.$log.term.setOption('fontSize', this.widget.fontSize);
          this.$log.term.setOption('fontWeight', this.widget.fontWeight);
          this.resizeEvent.next(undefined);
          setTimeout(() => {
            this.$log.term.scrollToBottom();
          }, 100);
        }
      },
    });

  }

  getTerminalHeight(): number {
    const widgetContainerHeight = (this.widgetContainerElement.nativeElement as HTMLElement).offsetHeight;
    const titleHeight = (this.titleElement.nativeElement as HTMLElement).offsetHeight;
    return widgetContainerHeight - titleHeight;
  }

  ngOnDestroy() {
    this.$log.destroyTerminal();
  }

}
