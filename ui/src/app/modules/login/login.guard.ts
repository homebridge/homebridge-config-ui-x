import { inject, Injectable } from '@angular/core'
import { CanActivate, Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/settings.service'

@Injectable({
  providedIn: 'root',
})
export class LoginGuard implements CanActivate {
  private $auth = inject(AuthService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)

  public async canActivate(): Promise<boolean> {
    // Ensure app settings are loaded
    if (!this.$settings.settingsLoaded) {
      await firstValueFrom(this.$settings.onSettingsLoaded)
    }

    if (this.$settings.env.setupWizardComplete === false) {
      // Redirect to set up wizard page
      void this.$router.navigate(['/setup'])
      return false
    }

    // If using not using auth, or already logged in, redirect back to home screen
    if (this.$settings.formAuth === false || this.$auth.isLoggedIn()) {
      // Redirect to login page
      void this.$router.navigate(['/'])
      return false
    }

    return true
  }
}
