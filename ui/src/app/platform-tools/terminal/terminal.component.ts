import { Component, OnInit, HostListener } from '@angular/core';
import { Terminal } from 'xterm';
import * as fit from 'xterm/lib/addons/fit/fit';

import { WsService } from '../../_services/ws.service';

Terminal.applyAddon(fit);

@Component({
  selector: 'app-terminal',
  templateUrl: './terminal.component.html'
})
export class TerminalComponent implements OnInit {
  private term = new Terminal();
  private termTarget: HTMLElement;

  private onOpen;
  private onMessage;
  private onError;
  private onClose;

  constructor(private ws: WsService) { }

  ngOnInit() {
    // set body bg color
    window.document.querySelector('body').classList.add(`bg-black`);

    // create terminal
    this.termTarget = document.getElementById('docker-terminal');
    this.term.open(this.termTarget);
    (<any>this.term).fit();

    // subscribe to terminal events
    if (this.ws.socket.readyState) {
      this.ws.subscribe('terminal');
      this.startTerminal();
    }

    this.onOpen = this.ws.open.subscribe(() => {
      this.ws.subscribe('terminal');
      this.startTerminal();
    });

    // listen for terminal data
    this.onMessage = this.ws.handlers.terminal.subscribe((data) => {
      this.term.write(data);
    });

    // handle resize events
    this.term.on('resize', (size) => {
      this.resizeTerminal(size);
    });

    // handle data events
    this.term.on('data', (data) => {
      this.ws.send({ terminal: { data: data } });
    });

    this.onClose = this.ws.close.subscribe(() => {
      this.term.reset();
      this.term.write('Connection to server lost...');
    });

    this.onError = this.ws.error.subscribe((err) => {
      this.term.write('Websocket failed to connect. Is the server running?\n\r');
    });
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(event) {
    (<any>this.term).fit();
  }

  startTerminal() {
    this.term.reset();
    this.ws.send({ terminal: { start: true } });
    this.resizeTerminal({ cols: this.term.cols, rows: this.term.rows });
    this.term.focus();
  }

  resizeTerminal(size) {
    this.ws.send({ terminal: { size: size } });
  }

  // tslint:disable-next-line:use-life-cycle-interface
  ngOnDestroy() {
    // unset body bg color
    window.document.querySelector('body').classList.remove(`bg-black`);

    try {
      // unsubscribe from log events
      this.ws.unsubscribe('terminal');

      // unsubscribe listeners
      this.onOpen.unsubscribe();
      this.onMessage.unsubscribe();
      this.onError.unsubscribe();
      this.onClose.unsubscribe();

      // destroy the terminal
      this.term.destroy();
    } catch (e) { }
  }

}
