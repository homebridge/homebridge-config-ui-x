import { Component, OnInit, HostListener, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Subject } from 'rxjs/Subject';
import { LogService } from '../../core/log.service';

@Component({
  selector: 'app-logs',
  templateUrl: './logs.component.html',
})
export class LogsComponent implements OnInit, OnDestroy {
  @ViewChild('logoutput', { static: true }) termTarget: ElementRef;
  private resizeEvent = new Subject();

  constructor(
    private $log: LogService,
  ) { }

  ngOnInit() {
    // set body bg color
    window.document.querySelector('body').classList.add(`bg-black`);

    // start the terminal
    this.$log.startTerminal(this.termTarget, {}, this.resizeEvent);
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(event) {
    this.resizeEvent.next();
  }

  ngOnDestroy() {
    // unset body bg color
    window.document.querySelector('body').classList.remove(`bg-black`);

    // destroy the terminal
    this.$log.destroyTerminal();
  }

}

export const LogsStates = {
  name: 'logs',
  url: '/logs',
  component: LogsComponent,
  data: {
    requiresAuth: true,
  },
};
