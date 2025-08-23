import { inject, Injectable } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/settings.service'

@Injectable({
  providedIn: 'root',
})
export class AdminGuard implements CanActivate {
  private $auth = inject(AuthService)
  private $authHelper = inject(AuthHelperService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $translate = inject(TranslateService)
  private $toastr = inject(ToastrService)

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

    // First check if authenticated
    if (!await this.$authHelper.isAuthenticated()) {
      // Not authenticated - redirect to login
      window.sessionStorage.setItem('target_route', state.url)
      await this.$router.navigate(['/login'])
      return false
    }

    // Check if user is admin
    if (this.$auth.user?.admin) {
      return true
    }

    // User is authenticated but not admin - show error and redirect to home
    this.$toastr.error(
      this.$translate.instant('toast.no_auth'),
      this.$translate.instant('toast.title_error'),
    )
    await this.$router.navigate(['/'])
    return false
  }
}
