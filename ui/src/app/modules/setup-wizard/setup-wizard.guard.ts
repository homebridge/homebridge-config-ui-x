import { SettingsService } from '@/app/core/settings.service'
import { Injectable } from '@angular/core'
import { CanActivate, Router } from '@angular/router'

@Injectable({
  providedIn: 'root',
})
export class SetupWizardGuard implements CanActivate {
  constructor(
    private $router: Router,
    private $settings: SettingsService,
  ) {}

  async canActivate(): Promise<boolean> {
    if (!this.$settings.settingsLoaded) {
      await this.$settings.onSettingsLoaded.toPromise()
    }

    if (this.$settings.env.setupWizardComplete === false) {
      return true
    }

    this.$router.navigate(['/'])
    return true
  }
}
