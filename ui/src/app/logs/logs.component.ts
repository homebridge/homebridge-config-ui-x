import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { Terminal } from 'xterm';
import * as fit from 'xterm/lib/addons/fit/fit';

import { WsService } from '../_services/ws.service';

Terminal.applyAddon(fit);

@Component({
  selector: 'app-logs',
  templateUrl: './logs.component.html'
})
export class LogsComponent implements OnInit, OnDestroy {
  private io = this.$ws.connectToNamespace('log');

  private term = new Terminal();
  private termTarget: HTMLElement;

  constructor(
    private $ws: WsService
  ) { }

  ngOnInit() {
    // set body bg color
    window.document.querySelector('body').classList.add(`bg-black`);

    this.termTarget = document.getElementById('log-output');
    this.term.open(this.termTarget);
    (<any>this.term).fit();

    this.io.socket.on('connect', () => {
      this.io.socket.emit('tail-log');
    });

    this.io.socket.on('disconnect', () => {
      this.term.write('Websocket failed to connect. Is the server running?\n\r\n\r');
    });

    // subscribe to log events
    this.io.socket.on('stdout', data => {
      this.term.write(data);
      this.resizeTerminal({ cols: this.term.cols, rows: this.term.rows });
    });

    // handle resize events
    this.term.on('resize', (size) => {
      this.resizeTerminal(size);
    });
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(event) {
    (<any>this.term).fit();
  }

  resizeTerminal(size) {
    this.io.socket.emit('resize', size);
  }

  ngOnDestroy() {
    // unset body bg color
    window.document.querySelector('body').classList.remove(`bg-black`);

    this.io.socket.disconnect();
    this.io.socket.removeAllListeners();
    this.term.destroy();
  }

}

export const LogsStates = {
  name: 'logs',
  url: '/logs',
  component: LogsComponent,
  data: {
    requiresAuth: true
  }
};
