import { Injectable, Injector } from '@angular/core';
import { HttpEvent, HttpInterceptor, HttpHandler, HttpRequest } from '@angular/common/http';
import { StateService } from '@uirouter/core';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/throw';
import 'rxjs/add/operator/catch';

import { AuthService } from './auth.service';

@Injectable()
export class AuthHttpInterceptor implements HttpInterceptor {
  $state: StateService;
  $auth: AuthService;

  constructor(
    private $injector: Injector
  ) {
    setTimeout(() => {
      this.$state = this.$injector.get(StateService);
      this.$auth = this.$injector.get(AuthService);
    });
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Clone the request and add jwt header to each request.
    // Not using 'Authorization' header as it may conflict with users who setup basic auth
    const authReq = req.clone({
      headers: req.headers.set('X-JWT', `${window.localStorage.getItem('token')}`)
    });

    // send the newly created request
    return next.handle(authReq)
      .catch((error, caught) => {

        if (error.status === 401 && this.$state.current.name !== 'login') {
          this.$auth.logout();
          if (this.$auth.formAuth) {
            window.location.reload();
          }
        }

        return Observable.throw(error);
      }) as any;
  }
}

