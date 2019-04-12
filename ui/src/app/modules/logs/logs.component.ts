import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs/Subject';
import { debounceTime } from 'rxjs/operators';
import { Terminal } from 'xterm';
import * as fit from 'xterm/lib/addons/fit/fit';
import { WsService } from '../../core/ws.service';

Terminal.applyAddon(fit);

@Component({
  selector: 'app-logs',
  templateUrl: './logs.component.html',
})
export class LogsComponent implements OnInit, OnDestroy {
  private io = this.$ws.connectToNamespace('log');

  private term = new Terminal();
  private termTarget: HTMLElement;
  private resize = new Subject();

  constructor(
    private $ws: WsService,
  ) { }

  ngOnInit() {
    // set body bg color
    window.document.querySelector('body').classList.add(`bg-black`);

    this.termTarget = document.getElementById('log-output');
    this.term.open(this.termTarget);
    (<any>this.term).fit();

    this.io.connected.subscribe(() => {
      this.io.socket.emit('tail-log', { cols: this.term.cols, rows: this.term.rows });
    });

    this.io.socket.on('disconnect', () => {
      this.term.write('Websocket failed to connect. Is the server running?\n\r\n\r');
    });

    // send resize events
    this.resize.pipe(debounceTime(500)).subscribe((size) => {
      this.io.socket.emit('resize', size);
    });

    // subscribe to log events
    this.io.socket.on('stdout', data => {
      this.term.write(data);
    });

    // handle resize events
    this.term.on('resize', (size) => {
      this.resize.next(size);
    });
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(event) {
    (<any>this.term).fit();
  }

  ngOnDestroy() {
    // unset body bg color
    window.document.querySelector('body').classList.remove(`bg-black`);
    this.io.end();
    this.term.dispose();
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
