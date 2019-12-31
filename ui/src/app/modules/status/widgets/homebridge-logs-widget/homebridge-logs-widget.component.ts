import { Component, OnInit, ViewChild, ElementRef, Input, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { LogService } from '../../../../core/log.service';

@Component({
  selector: 'app-homebridge-logs-widget',
  templateUrl: './homebridge-logs-widget.component.html',
  styleUrls: ['./homebridge-logs-widget.component.scss'],
})
export class HomebridgeLogsWidgetComponent implements OnInit, OnDestroy {
  @ViewChild('widgetcontainer', { static: true }) widgetContainerElement: ElementRef;
  @ViewChild('terminaltitle', { static: true }) titleElement: ElementRef;
  @ViewChild('logoutput', { static: true }) termTarget: ElementRef;
  @Input() resizeEvent: Subject<any>;

  public terminalHeight = 200;

  constructor(
    private $log: LogService,
  ) { }

  ngOnInit() {
    setTimeout(() => {
      this.$log.startTerminal(this.termTarget, {
        cursorBlink: false,
        theme: {
          background: '#2b2b2b',
        },
      }, this.resizeEvent);
    });

    this.resizeEvent.subscribe({
      next: () => {
        this.terminalHeight = this.getTerminalHeight();
      },
    });
  }

  getTerminalHeight(): number {
    const widgetContainerHeight = (<HTMLElement>this.widgetContainerElement.nativeElement).offsetHeight;
    const titleHeight = (<HTMLElement>this.titleElement.nativeElement).offsetHeight;
    return widgetContainerHeight - titleHeight;
  }

  ngOnDestroy() {
    this.$log.destroyTerminal();
  }

}
