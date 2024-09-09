import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/settings.service'
import { Injectable } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router'

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private $router: Router,
    private $auth: AuthService,
    private $settings: SettingsService,
  ) {}

  async canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): Promise<boolean> {
    // ensure app settings are loaded
    if (!this.$settings.settingsLoaded) {
      await this.$settings.onSettingsLoaded.toPromise()
    }

    if (this.$auth.isLoggedIn()) {
      return true
    } else {
      // if using not using auth, get a token
      if (this.$settings.formAuth === false) {
        await this.$auth.noauth()
        return true
      }

      // store desired route in session storage
      window.sessionStorage.setItem('target_route', state.url)

      // redirect to login page
      this.$router.navigate(['login'])

      return false
    }
  }
}
