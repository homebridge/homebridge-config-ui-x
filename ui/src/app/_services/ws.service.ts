import { Injectable, EventEmitter, Output } from '@angular/core';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

@Injectable()
export class WsService {
  @Output() open: EventEmitter<any> = new EventEmitter();
  @Output() close: EventEmitter<any> = new EventEmitter();
  @Output() error: EventEmitter<any> = new EventEmitter();

  public handlers = {
    stats: new EventEmitter(),
    server: new EventEmitter(),
    logs: new EventEmitter(),
    accessories: new EventEmitter(),
    terminal: new EventEmitter(),
    npmLog: new EventEmitter(),
    npmInstall: new EventEmitter()
  };

  private routes = Object.keys(this.handlers);

  public socket;
  private url = environment.socketUrl;
  private reconnecting = false;
  private autoReconnectInterval = 2000;

  constructor(
    private $api: ApiService,
    private $auth: AuthService
  ) {
    this.socket = { readyState: 0 };
    this.listen();
  }

  listen() {
    this.$api.getToken().subscribe((auth: any) => {
      this.socket = new (<any>window).WebSocket(`${this.url}/wsocket?token=${this.$auth.user.token}`);

      this.socket.onopen = () => {
        this.open.emit(null);
        this.$auth.getAppSettings();
      };

      this.socket.onmessage = (msg) => {
        try {
          const json = JSON.parse(msg.data);
          this.routeMessage(json);
        } catch (e) { }
      };

      this.socket.onclose = () => {
        this.close.emit(null);
        this.reconnect();
      };

      this.socket.onerror = () => {
        this.error.emit(null);
        this.reconnect();
      };
    }, (err) => this.reconnect());
  }

  reconnect() {
    if (!this.reconnecting) {
      this.reconnecting = true;
      setTimeout(() => {
        this.reconnecting = false;
        this.listen();
      }, this.autoReconnectInterval);
    }
  }

  send(data: object) {
    this.socket.send(JSON.stringify(data));
  }

  subscribe(sub: string) {
    this.send({ subscribe: sub });
  }

  unsubscribe(sub: string) {
    this.send({ unsubscribe: sub });
  }

  routeMessage(msg: { data: any }) {
    this.routes.forEach((sub) => {
      if (sub in msg) {
        this.handlers[sub].emit(msg[sub]);
      }
    });
  }

}
