import { Injectable, ElementRef } from '@angular/core';
import { Terminal, ITerminalOptions } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { WsService, IoNamespace } from './ws.service';

@Injectable({
  providedIn: 'root',
})
export class LogService {
  private io: IoNamespace;
  public term: Terminal;

  private fitAddon: FitAddon;
  private webLinksAddon: WebLinksAddon;
  private resize: Subject<any>;
  private elementResize: Subject<any> | undefined;

  constructor(
    private $ws: WsService,
  ) { }

  startTerminal(
    targetElement: ElementRef,
    termOpts: ITerminalOptions = {},
    elementResize?: Subject<any>) {

    // handle element resize events
    this.elementResize = elementResize;

    // connect to the websocket endpoint
    this.io = this.$ws.connectToNamespace('log');

    // create a terminal instance
    this.term = new Terminal(termOpts);

    // load addons
    setTimeout(() => {
      this.term.loadAddon(this.fitAddon);
      this.term.loadAddon(this.webLinksAddon);
    });

    this.fitAddon = new FitAddon();
    this.webLinksAddon = new WebLinksAddon();

    // create a subject to listen for resize events
    this.resize = new Subject();

    // open the terminal in the target element
    this.term.open(targetElement.nativeElement);

    // fit to the element
    setTimeout(() => {
      this.fitAddon.activate(this.term);
      this.fitAddon.fit();
    });

    // start the terminal session when the socket is connected
    this.io.connected.subscribe(() => {
      this.term.reset();
      this.io.socket.emit('tail-log', { cols: this.term.cols, rows: this.term.rows });
    });

    // handle disconnect events
    this.io.socket.on('disconnect', () => {
      this.term.write('\n\r\n\rWebsocket failed to connect. Is the server running?\n\r\n\r');
    });

    // send resize events to server
    this.resize.pipe(debounceTime(500)).subscribe((size) => {
      this.io.socket.emit('resize', size);
    });

    // subscribe to incoming data events from server to client
    this.io.socket.on('stdout', data => {
      this.term.write(data);
    });

    // handle resize events from the client
    this.term.onResize((size) => {
      this.resize.next(size);
    });

    if (this.elementResize) {
      // subscribe to grid resize event
      this.elementResize.pipe(debounceTime(100)).subscribe({
        next: () => {
          this.fitAddon.fit();
        },
      });
    }
  }

  destroyTerminal() {
    this.io.end();
    this.term.dispose();
    this.resize.complete();
    if (this.elementResize) {
      this.elementResize.complete();
    }
  }
}
