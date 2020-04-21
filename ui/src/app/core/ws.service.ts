import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import { connect } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AuthService } from './auth/auth.service';

export interface IoNamespace {
  connected?: Subject<any>;
  socket: SocketIOClient.Socket;
  request: (resource: string, payload?: string | object | Array<any>) => Observable<any>;
  end?: () => void;
}

@Injectable({
  providedIn: 'root',
})
export class WsService {
  constructor(
    private $auth: AuthService,
  ) { }

  private namespaceConnectionCache = {};

  /**
   * Wrapper function to reuse the same connecting
   * @param namespace
   */
  public connectToNamespace(namespace: string): IoNamespace {
    if (this.namespaceConnectionCache[namespace]) {
      /* connection to namespace already exists */
      const io: IoNamespace = this.namespaceConnectionCache[namespace];
      io.connected = new Subject();

      // broadcast to sbuscribers that the connection is ready
      setTimeout(() => {
        if (io.socket.connected) {
          io.connected.next();
        }
      });

      // watch for re-connections, and broadcast
      io.socket.on('connect', () => {
        io.connected.next();
      });

      // define end function
      io.end = () => {
        io.socket.emit('end');
        io.socket.removeAllListeners();
        io.connected.complete();
      };

      return this.namespaceConnectionCache[namespace];
    } else {
      /* first time connecting to namespace */
      const io = this.establishConnectionToNamespace(namespace);
      io.connected = new Subject();

      // wait for the connection and broadcase when ready
      io.socket.on('connect', () => {
        io.connected.next();
      });

      // define end function
      io.end = () => {
        io.socket.emit('end');
        io.socket.removeAllListeners();
        io.connected.complete();
      };

      // cache the connection
      this.namespaceConnectionCache[namespace] = io;
      return io;
    }
  }

  public getExistingNamespace(namespace: string): IoNamespace {
    return this.namespaceConnectionCache[namespace];
  }

  /**
   * Establish a connection to the namespace
   * @param namespace
   */
  private establishConnectionToNamespace(namespace: string): IoNamespace {
    const socket: SocketIOClient.Socket = connect(`${environment.api.socket}/${namespace}`, {
      path: environment.api.socketPath,
      query: {
        token: this.$auth.token,
      },
    });

    function request(resource, payload): Observable<any> {
      return new Observable((observer) => {
        socket.emit(resource, payload, (resp) => {
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
      request,
    };
  }
}
