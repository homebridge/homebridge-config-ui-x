import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';

import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private $router: Router,
    private $auth: AuthService,
  ) { }

  async canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): | Promise<boolean> {
    // ensure app settings are loaded
    if (!this.$auth.settingsLoaded) {
      await this.$auth.getAppSettings();
    }

    if (this.$auth.isLoggedIn()) {
      return true;
    } else {
      // if using not using auth, get a token
      if (this.$auth.formAuth === false) {
        await this.$auth.noauth();
        return true;
      }

      // store desired route in session storage
      window.sessionStorage.setItem('target_route', state.url);

      // redirect to login page
      this.$router.navigate(['login']);

      return false;
    }
  }
}
