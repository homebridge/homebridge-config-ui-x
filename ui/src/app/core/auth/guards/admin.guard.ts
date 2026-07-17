import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/ui/settings.service'

export const adminGuard: CanActivateFn = async (_next, state) => {
  const $auth = inject(AuthService)
  const $authHelper = inject(AuthHelperService)
  const $router = inject(Router)
  const $settings = inject(SettingsService)
  const $translate = inject(TranslateService)
  const $toastr = inject(ToastrService)

  // Ensure app settings are loaded
  if (!$settings.settingsLoaded) {
    await firstValueFrom($settings.onSettingsLoaded)
  }

  // Wait for bootstrap loadToken() (hb-session mint + in-memory token)
  // before the admin refresh below. Without this, a concurrent
  // refreshSession() during bootstrap hits isRefreshing and no-ops,
  // skipping the admin-demotion check on cold load.
  await $auth.tokenReady

  // If not using form auth, get a token automatically
  if ($settings.formAuth === false) {
    await $auth.noauth()
    return true
  }

  // First check if authenticated
  if (!await $authHelper.isAuthenticated()) {
    // Not authenticated - redirect to login page
    window.sessionStorage.setItem('target_route', state.url)
    await $router.navigate(['/login'])
    return false
  }

  // Force a server roundtrip so admin-demoted users lose UI access within one
  // navigation instead of waiting for the JWT to expire. The backend rejects
  // /auth/refresh when the user's admin flag has changed; refreshSession()
  // then logs the user out via the rejection path.
  try {
    await $auth.refreshSession()
  } catch {
    window.sessionStorage.setItem('target_route', state.url)
    await $router.navigate(['/login'])
    return false
  }

  // Check if user is admin
  if ($auth.user?.admin) {
    return true
  }

  // User is authenticated but not admin - show error and redirect to home
  $toastr.error(
    $translate.instant('toast.no_auth'),
    $translate.instant('toast.title_error'),
  )
  await $router.navigate(['/'])
  return false
}
