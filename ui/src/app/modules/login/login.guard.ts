import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/settings.service'
import { Injectable } from '@angular/core'
import { CanActivate, Router } from '@angular/router'

@Injectable({
  providedIn: 'root',
})
export class LoginGuard implements CanActivate {
  constructor(
    private $router: Router,
    private $auth: AuthService,
    private $settings: SettingsService,
  ) {}

  async canActivate(): Promise<boolean> {
    // ensure app settings are loaded
    if (!this.$settings.settingsLoaded) {
      await this.$settings.onSettingsLoaded.toPromise()
    }

    if (this.$settings.env.setupWizardComplete === false) {
      // redirect to set up wizard page
      this.$router.navigate(['/setup'])
      return false
    }

    // if using not using auth, or already logged in, redirect back to home screen
    if (this.$settings.formAuth === false || this.$auth.isLoggedIn()) {
      // redirect to login page
      this.$router.navigate(['/'])
      return false
    }

    return true
  }
}
