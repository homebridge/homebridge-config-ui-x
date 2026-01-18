import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'

import { SettingsService } from '@/app/core/ui/settings.service'

export const setupWizardGuard: CanActivateFn = async () => {
  const $router = inject(Router)
  const $settings = inject(SettingsService)

  if (!$settings.settingsLoaded) {
    await firstValueFrom($settings.onSettingsLoaded)
  }

  if ($settings.env.setupWizardComplete === false) {
    return true
  }

  void $router.navigate(['/'])
  return true
}
