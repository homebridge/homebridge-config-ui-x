import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs/Subject';
import { debounceTime } from 'rxjs/operators';
import { Terminal } from 'xterm';
import * as fit from 'xterm/lib/addons/fit/fit';
import * as webLinks from 'xterm/lib/addons/webLinks/webLinks';
import { WsService } from '../../../core/ws.service';

Terminal.applyAddon(fit);
Terminal.applyAddon(webLinks);

@Component({
  selector: 'app-terminal',
  templateUrl: './terminal.component.html',
})
export class TerminalComponent implements OnInit, OnDestroy {
  private io = this.$ws.connectToNamespace('platform-tools/terminal');

  private term = new Terminal();
  private termTarget: HTMLElement;
  private resize = new Subject();

  constructor(
    private $ws: WsService,
  ) { }

  ngOnInit() {
    // set body bg color
    window.document.querySelector('body').classList.add(`bg-black`);

    // create terminal
    this.termTarget = document.getElementById('docker-terminal');
    this.term.open(this.termTarget);
    (<any>this.term).fit();
    (<any>this.term).webLinksInit();

    this.io.connected.subscribe(() => {
      this.startTerminal();
    });

    this.io.socket.on('disconnect', () => {
      this.term.write('\n\r\n\rTerminal disconnected. Is the server running?\n\r\n\r');
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

    // handle data events
    this.term.on('data', (data) => {
      this.io.socket.emit('stdin', data);
    });
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(event) {
    (<any>this.term).fit();
  }

  startTerminal() {
    this.term.reset();
    this.io.socket.emit('start-session', { cols: this.term.cols, rows: this.term.rows });
    this.resize.next({ cols: this.term.cols, rows: this.term.rows });
    this.term.focus();
  }

  // tslint:disable-next-line:use-life-cycle-interface
  ngOnDestroy() {
    // unset body bg color
    window.document.querySelector('body').classList.remove(`bg-black`);

    this.io.end();
    this.term.dispose();
  }

}
