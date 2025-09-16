import { inject, Injectable } from '@angular/core'
import { CanActivate, Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'

import { SettingsService } from '@/app/core/settings.service'

@Injectable({
  providedIn: 'root',
})
export class SetupWizardGuard implements CanActivate {
  private $router = inject(Router)
  private $settings = inject(SettingsService)

  public async canActivate(): Promise<boolean> {
    if (!this.$settings.settingsLoaded) {
      await firstValueFrom(this.$settings.onSettingsLoaded)
    }

    if (this.$settings.env.setupWizardComplete === false) {
      return true
    }

    void this.$router.navigate(['/'])
    return true
  }
}
