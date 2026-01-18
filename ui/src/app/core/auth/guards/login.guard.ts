import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/ui/settings.service'

export const loginGuard: CanActivateFn = async () => {
  const $auth = inject(AuthService)
  const $router = inject(Router)
  const $settings = inject(SettingsService)

  // Ensure app settings are loaded
  if (!$settings.settingsLoaded) {
    await firstValueFrom($settings.onSettingsLoaded)
  }

  if ($settings.env.setupWizardComplete === false) {
    // Redirect to set up wizard page
    void $router.navigate(['/setup'])
    return false
  }

  // If using not using auth, or already logged in, redirect back to home screen
  if ($settings.formAuth === false || $auth.isLoggedIn()) {
    // Redirect to login page
    void $router.navigate(['/'])
    return false
  }

  return true
}
