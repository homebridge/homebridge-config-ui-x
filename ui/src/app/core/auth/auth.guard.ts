import { inject, Injectable } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router'
import { firstValueFrom } from 'rxjs'

import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/settings.service'

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private $auth = inject(AuthService)
  private $authHelper = inject(AuthHelperService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)

  public async canActivate(_next: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> {
    // Ensure app settings are loaded
    if (!this.$settings.settingsLoaded) {
      await firstValueFrom(this.$settings.onSettingsLoaded)
    }

    // If not using form auth, get a token automatically
    if (this.$settings.formAuth === false) {
      await this.$auth.noauth()
      return true
    }

    // Check authentication status
    if (await this.$authHelper.isAuthenticated()) {
      // Refresh token if needed on navigation
      await this.$auth.checkAndRefreshIfNeeded()
      return true
    }

    // Not authenticated - redirect to login
    window.sessionStorage.setItem('target_route', state.url)
    await this.$router.navigate(['/login'])
    return false
  }
}
