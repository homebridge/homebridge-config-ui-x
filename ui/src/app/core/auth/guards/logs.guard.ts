import { inject } from '@angular/core'
import { CanActivateFn } from '@angular/router'
import { firstValueFrom } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { adminGuard } from '@/app/core/auth/guards/admin.guard'
import { authGuard } from '@/app/core/auth/guards/auth.guard'
import { SettingsService } from '@/app/core/ui/settings.service'

/**
 * Guards the log viewer.
 *
 * The Homebridge log is readable by any signed-in user by default, which is the
 * long-standing behaviour. When an admin sets `restrictLogsToAdmins` in the UI
 * config, this defers to the admin guard instead — matching the backend, which
 * enforces the same rule on the log websocket (WsLogGuard). Without the route
 * guard a non-admin could still open /logs directly and get an empty terminal.
 */
export const logsGuard: CanActivateFn = async (next, state) => {
  const $auth = inject(AuthService)
  const $settings = inject(SettingsService)

  // The guards below wait for these too, but the flag has to be read before
  // choosing which one to defer to.
  if (!$settings.settingsLoaded) {
    await firstValueFrom($settings.onSettingsLoaded)
  }

  // ⚠️ Also wait for the bootstrap token load. `restrictLogsToAdmins` is only
  // sent to an authorised caller, and SettingsService's first fetch runs before
  // a token exists — so reading the flag any earlier sees `undefined` on every
  // page load and silently falls back to the permissive guard.
  await $auth.tokenReady

  // Both delegates are async and resolve to a boolean. The cast is needed
  // because CanActivateFn also permits returning an Observable, which a
  // promise-returning wrapper cannot express.
  const delegate = $settings.env?.restrictLogsToAdmins ? adminGuard : authGuard
  return await (delegate(next, state) as Promise<boolean>)
}
