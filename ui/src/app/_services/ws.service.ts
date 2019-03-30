import { Injectable, EventEmitter, Output } from '@angular/core';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

import { connect } from 'socket.io-client';
import { Observable } from 'rxjs';

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

  public io: SocketIOClient.Socket;

  constructor(
    private $api: ApiService,
    private $auth: AuthService
  ) {
    this.socket = { readyState: 0 };
    this.listen();

    this.io = connect(environment.api.socket, {
      transports: ['websocket'],
      multiplex: true,
      query: {
        some: 'thing',
      },
    });
  }

  /**
   * Establish a connection to the namespace
   * @param namespace
   */
  connectToNamespace(namespace: string) {
    const socket = connect(`${environment.api.socket}/${namespace}`, {
      transports: ['websocket'],
      query: {
        some: 'thing',
      },
    });

    function request(resource: string, payload?: string | object | Array<any>): Observable<string | object | Array<any>> {
      return Observable.create((observer) => {
        socket.emit(resource, payload, (resp) => {
          console.log(resp);
          if (typeof resp === 'object' && resp.error) {
            observer.error(resp);
          } else {
            observer.next(resp);
          }
          observer.complete();
        });
      });
    }

    return {
      socket,
      request
    };
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
