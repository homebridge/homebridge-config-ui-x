import { Component, OnInit, ViewChild, ElementRef, Input, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { TerminalService } from '../../../../core/terminal.service';

@Component({
  selector: 'app-terminal-widget',
  templateUrl: './terminal-widget.component.html',
  styleUrls: ['./terminal-widget.component.scss'],
})
export class TerminalWidgetComponent implements OnInit, OnDestroy {
  @ViewChild('terminaloutput', { static: true }) termTarget: ElementRef;
  @Input() resizeEvent: Subject<any>;

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
  }

  ngOnDestroy() {
    this.$terminal.destroyTerminal();
  }
}
