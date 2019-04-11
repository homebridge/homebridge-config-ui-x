import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { connect } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AuthService } from './auth/auth.service';

@Injectable({
  providedIn: 'root',
})
export class WsService {
  constructor(
    private $auth: AuthService,
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
