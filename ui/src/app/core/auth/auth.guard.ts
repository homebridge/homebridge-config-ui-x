import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable } from 'rxjs';

import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private $router: Router,
    private $auth: AuthService,
  ) { }

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean {
    if (this.$auth.isLoggedIn()) {
      return true;
    } else {
      // store desired route in session storage
      window.sessionStorage.setItem('target_route', state.url);

      // redirect to login page
      this.$router.navigate(['login']);
      return false;
    }
  }
}
