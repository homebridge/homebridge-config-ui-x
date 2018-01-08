import { Component, OnInit } from '@angular/core';

import { WsService } from '../_services/ws.service';

@Component({
  selector: 'app-logs',
  templateUrl: './logs.component.html'
})
class LogsComponent implements OnInit {
  private onOpen;
  private onMessage;
  private onError;
  private term = new (<any>window).Terminal();

  constructor(private ws: WsService) {}

  ngOnInit() {
    this.term.open(document.getElementById('log-output'), { focus: false });
    this.term.fit();
    this.term.write('\n\r\n\r\n\r\n\r\n\r');

    // subscribe to log events
    if (this.ws.socket.readyState) {
      this.ws.send('logs-sub');
    }

    this.onOpen = this.ws.open.subscribe(() => {
      this.ws.send('logs-sub');
    });

    this.onMessage = this.ws.message.subscribe((data) => {
      try {
        data = JSON.parse(data.data);
        if (data.log) {
          this.term.write(data.log);
        }
      } catch (e) { }
    });

    this.onError = this.ws.error.subscribe((err) => {
      this.term.write('Websocket failed to connect. Is the server running?\n\r');
    });
  }

  // tslint:disable-next-line:use-life-cycle-interface
  ngOnDestroy() {
    try {
      // unsubscribe from log events
      this.ws.send('logs-unsub');

      // unsubscribe listeners
      this.onOpen.unsubscribe();
      this.onMessage.unsubscribe();
      this.onError.unsubscribe();
    } catch (e) {}
  }

}

const LogsStates = {
  name: 'logs',
  url: '/logs',
  component: LogsComponent
};

export { LogsComponent, LogsStates };
