import { Injectable, EventEmitter, Output } from '@angular/core';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';

@Injectable()
export class WsService {
  @Output() open: EventEmitter<any> = new EventEmitter();
  @Output() message: EventEmitter<any> = new EventEmitter();
  @Output() close: EventEmitter<any> = new EventEmitter();
  @Output() error: EventEmitter<any> = new EventEmitter();

  public socket;
  private url = environment.socketUrl;
  private reconnecting = false;
  private autoReconnectInterval = 2000;

  constructor(
    private $api: ApiService
  ) {
    this.socket = { readyState: 0}
    this.listen();
  }

  listen() {
    this.$api.getToken().subscribe((auth: any) => {
      this.socket = new (<any>window).WebSocket(`${this.url}/?username=${auth.username}&token=${auth.token}`);

      this.socket.onopen = () => {
        this.open.emit(null);
      };

      this.socket.onmessage = (msg) => {
        this.message.emit(msg);
      };

      this.socket.onclose = () => {
        this.close.emit(null);
        this.reconnect();
      };

      this.socket.onerror = () => {
        this.error.emit(null);
        this.reconnect();
      };
    }, (err) => this.reconnect())
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
    this.send({subscribe: sub})
  }

  unsubscribe(sub: string) {
    this.send({ unsubscribe: sub })
  }

}
