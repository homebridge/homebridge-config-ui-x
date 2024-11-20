import { SettingsService } from '@/app/core/settings.service'
import { inject, Injectable } from '@angular/core'
import { CanActivate, Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'

@Injectable({
  providedIn: 'root',
})
export class SetupWizardGuard implements CanActivate {
  private $router = inject(Router)
  private $settings = inject(SettingsService)

  async canActivate(): Promise<boolean> {
    if (!this.$settings.settingsLoaded) {
      await firstValueFrom(this.$settings.onSettingsLoaded)
    }

    if (this.$settings.env.setupWizardComplete === false) {
      return true
    }

    this.$router.navigate(['/'])
    return true
  }
}
