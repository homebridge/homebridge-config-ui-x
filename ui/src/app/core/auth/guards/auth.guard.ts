import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'

import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/ui/settings.service'

export const authGuard: CanActivateFn = async (_next, state) => {
  const $auth = inject(AuthService)
  const $authHelper = inject(AuthHelperService)
  const $router = inject(Router)
  const $settings = inject(SettingsService)

  // Ensure app settings are loaded
  if (!$settings.settingsLoaded) {
    await firstValueFrom($settings.onSettingsLoaded)
  }

  // Wait for bootstrap loadToken() so a fast first navigation does not make
  // authentication decisions before the stored token has been validated.
  await $auth.tokenReady

  // Fresh install: short-circuit straight to the setup wizard instead of
  // bouncing through /login first
  if ($settings.env.setupWizardComplete === false) {
    await $router.navigate(['/setup'])
    return false
  }

  // If not using form auth, get a token automatically
  if ($settings.formAuth === false) {
    await $auth.noauth()
    return true
  }

  // Check authentication status
  if (await $authHelper.isAuthenticated()) {
    // Refresh token if needed on navigation
    await $auth.checkAndRefreshIfNeeded()
    return true
  }

  // Not authenticated - redirect to login page
  window.sessionStorage.setItem('target_route', state.url)
  await $router.navigate(['/login'])
  return false
}
