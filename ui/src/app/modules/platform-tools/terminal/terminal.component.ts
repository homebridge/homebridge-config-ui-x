import { Component, OnInit, HostListener, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Subject } from 'rxjs';
import { TerminalService } from '../../../core/terminal.service';

@Component({
  selector: 'app-terminal',
  templateUrl: './terminal.component.html',
})
export class TerminalComponent implements OnInit, OnDestroy {
  @ViewChild('terminaloutput', { static: true }) termTarget: ElementRef;
  private resizeEvent = new Subject();

  constructor(
    private $terminal: TerminalService,
  ) {
  }

  ngOnInit() {
    // set body bg color
    window.document.querySelector('body').classList.add(`bg-black`);

    // start the terminal
    this.$terminal.startTerminal(this.termTarget, {}, this.resizeEvent);

    // set focus to the terminal
    this.$terminal.term.focus();
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(event) {
    this.resizeEvent.next();
  }

  ngOnDestroy() {
    // unset body bg color
    window.document.querySelector('body').classList.remove(`bg-black`);

    // destroy the terminal
    this.$terminal.destroyTerminal();
  }

}
