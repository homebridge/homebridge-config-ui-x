import { Component, OnInit, HostListener } from '@angular/core';
import { Terminal } from 'xterm';
import * as fit from 'xterm/lib/addons/fit/fit';

import { WsService } from '../_services/ws.service';

Terminal.applyAddon(fit);

@Component({
  selector: 'app-logs',
  templateUrl: './logs.component.html'
})
export class LogsComponent implements OnInit {
  private term = new Terminal();
  private termTarget: HTMLElement;

  private onOpen;
  private onMessage;
  private onError;

  constructor(private ws: WsService) {}

  ngOnInit() {
    this.termTarget = document.getElementById('log-output');
    this.term.open(this.termTarget);
    (<any>this.term).fit();

    this.term.write('\n\r\n\r\n\r\n\r\n\r');

    // subscribe to log events
    if (this.ws.socket.readyState) {
      this.ws.subscribe('logs');
      this.resizeTerminal({ cols: this.term.cols, rows: this.term.rows });
    }

    this.onOpen = this.ws.open.subscribe(() => {
      this.ws.subscribe('logs');
      this.resizeTerminal({ cols: this.term.cols, rows: this.term.rows });
    });

    // listen for to log data
    this.onMessage = this.ws.handlers.logs.subscribe((data) => {
      this.term.write(data);
    });

    // handle resize events
    this.term.on('resize', (size) => {
      this.resizeTerminal(size);
    });

    this.onError = this.ws.error.subscribe((err) => {
      this.term.write('Websocket failed to connect. Is the server running?\n\r');
    });
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(event) {
    (<any>this.term).fit();
  }

  resizeTerminal(size) {
    this.ws.send({ logs: { size: size } });
  }

  // tslint:disable-next-line:use-life-cycle-interface
  ngOnDestroy() {
    try {
      // unsubscribe from log events
      this.ws.unsubscribe('logs');

      // unsubscribe listeners
      this.onOpen.unsubscribe();
      this.onMessage.unsubscribe();
      this.onError.unsubscribe();

      // destroy the terminal
      this.term.destroy();
    } catch (e) {}
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
