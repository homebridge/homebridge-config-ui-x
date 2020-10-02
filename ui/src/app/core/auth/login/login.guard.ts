import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { AuthService } from '@/app/core/auth/auth.service';

@Injectable({
  providedIn: 'root',
})
export class LoginGuard implements CanActivate {
  constructor(
    private $router: Router,
    private $auth: AuthService,
  ) { }

  async canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Promise<boolean> {
    // ensure app settings are loaded
    if (!this.$auth.settingsLoaded) {
      await this.$auth.onSettingsLoaded.toPromise();
    }

    // if using not using auth, or already logged in, redirect back to home screen
    if (this.$auth.formAuth === false || this.$auth.isLoggedIn()) {
      // redirect to login page
      this.$router.navigate(['/']);
      return false;
    }

    return true;
  }
}
