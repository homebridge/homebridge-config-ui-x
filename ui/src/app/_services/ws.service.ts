import { Injectable, EventEmitter, Output } from '@angular/core';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

import { connect } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable()
export class WsService {

  // remove below
  public socket;

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

  constructor(
    private $auth: AuthService
  ) { }

  /**
   * Establish a connection to the namespace
   * @param namespace
   */
  connectToNamespace(namespace: string) {
    const socket = connect(`${environment.api.socket}/${namespace}`, {
      transports: ['websocket'],
      query: {
        token: this.$auth.token,
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

  // remove below
  send(data: object) {
  }

  subscribe(sub: string) {
  }

  unsubscribe(sub: string) {
  }

  routeMessage(msg: { data: any }) {
  }

}
