import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/settings.service'
import { inject, Injectable } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router'
import { firstValueFrom } from 'rxjs'

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private $auth = inject(AuthService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)

  async canActivate(
    _next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): Promise<boolean> {
    // ensure app settings are loaded
    if (!this.$settings.settingsLoaded) {
      await firstValueFrom(this.$settings.onSettingsLoaded)
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
