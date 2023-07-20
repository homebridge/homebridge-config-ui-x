import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';

import { AuthService } from '@/app/core/auth/auth.service';
import { SettingsService } from '@/app/core/settings.service';

@Injectable({
  providedIn: 'root',
})
export class LoginGuard implements CanActivate {
  constructor(
    private $router: Router,
    private $auth: AuthService,
    private $settings: SettingsService,
  ) { }

  async canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Promise<boolean> {
    // ensure app settings are loaded
    if (!this.$settings.settingsLoaded) {
      await this.$settings.onSettingsLoaded.toPromise();
    }

    if (this.$settings.env.setupWizardComplete === false) {
      // redirect to setup wizard page
      this.$router.navigate(['/setup']);
      return false;
    }

    // if using not using auth, or already logged in, redirect back to home screen
    if (this.$settings.formAuth === false || this.$auth.isLoggedIn()) {
      // redirect to login page
      this.$router.navigate(['/']);
      return false;
    }

    return true;
  }
}
