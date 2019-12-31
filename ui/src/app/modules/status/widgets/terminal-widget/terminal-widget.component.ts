import { Component, OnInit, ViewChild, ElementRef, Input, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { TerminalService } from '../../../../core/terminal.service';

@Component({
  selector: 'app-terminal-widget',
  templateUrl: './terminal-widget.component.html',
  styleUrls: ['./terminal-widget.component.scss'],
})
export class TerminalWidgetComponent implements OnInit, OnDestroy {
  @ViewChild('widgetcontainer', { static: true }) widgetContainerElement: ElementRef;
  @ViewChild('terminaltitle', { static: true }) titleElement: ElementRef;
  @ViewChild('terminaloutput', { static: true }) termTarget: ElementRef;
  @Input() resizeEvent: Subject<any>;

  public terminalHeight = 200;

  constructor(
    private $terminal: TerminalService,
  ) { }

  ngOnInit() {
    setTimeout(() => {
      this.$terminal.startTerminal(this.termTarget, {
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
    this.$terminal.destroyTerminal();
  }
}
