/* global NodeJS */
import { inject, Injectable } from '@angular/core'
import { JwtHelperService } from '@auth0/angular-jwt'
import { firstValueFrom } from 'rxjs'

import { UserInterface } from '@/app/core/auth/auth.interfaces'
import { TokenCacheService } from '@/app/core/auth/token-cache.service'
import { setStoredToken } from '@/app/core/auth/token-store'
import { ApiService } from '@/app/core/communication/api.service'
import { NotificationService } from '@/app/core/communication/notification.service'
import { SettingsService } from '@/app/core/ui/settings.service'

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private $api = inject(ApiService)
  private $jwtHelper = inject(JwtHelperService)
  private $notification = inject(NotificationService)
  private $settings = inject(SettingsService)
  private $tokenCache = inject(TokenCacheService)

  public token: string | null = null
  public user: UserInterface = {} as UserInterface
  // Resolves once the constructor's loadToken() finishes — guards that
  // check isLoggedIn() at startup must await this so they don't see the
  // pre-load empty state on a fast first navigation.
  public readonly tokenReady: Promise<void>
  private logoutTimer!: NodeJS.Timeout
  private lastRefreshTime: number = Date.now()
  private isRefreshing: boolean = false

  constructor() {
    // Load the token (if present) from local storage on page init
    this.tokenReady = this.loadToken()
  }

  public async login(form: { username: string, password: string, otp?: string }) {
    const resp = await this.$api.post('/auth/login', form, { withCredentials: true })
    if (!this.validateToken(resp.access_token)) {
      throw new Error('Invalid username or password.')
    }
    setStoredToken(resp.access_token)
    await this.$settings.getAppSettings() // update settings to get full settings object
  }

  public async noauth() {
    const resp = await this.$api.post('/auth/noauth', {}, { withCredentials: true })
    if (!this.validateToken(resp.access_token)) {
      throw new Error('Invalid username or password.')
    } else {
      setStoredToken(resp.access_token)
      await this.$settings.getAppSettings() // update settings to get full settings
    }
  }

  /**
   * @param options - how far the logout reaches
   * @param options.scope - `'local'` signs out this browser only. The inactivity
   * timer uses it because it fires while the token is still valid, and a full
   * logout revokes the account's sessions everywhere - so without it, one idle
   * tab forgotten on another machine ends the user's active session here.
   * A logout the user actually asked for stays account-wide.
   */
  public logout(options?: { scope?: 'local' }) {
    clearTimeout(this.logoutTimer)
    // Clear the HttpOnly cookies server-side before reloading. Without this the
    // browser would still hold a valid hb-refresh cookie and the reload would
    // silently restore the session the user just ended.
    // Start the request while the bearer token is still available to the HTTP
    // interceptor, then clear local authentication immediately. The server
    // cleanup is best-effort and must not leave the UI signed in if it stalls.
    const logoutRequest = this.$api.post('/auth/logout', options?.scope ? { scope: options.scope } : {}, { withCredentials: true })
    this.user = {} as UserInterface
    this.token = null
    setStoredToken(null)
    logoutRequest
      .catch(() => { /* logging out regardless */ })
      .finally(() => {
        window.location.reload()
      })
  }

  public async loadToken() {
    if (!this.$settings.settingsLoaded) {
      await firstValueFrom(this.$settings.onSettingsLoaded)
    }
    // The access token is only ever held in memory, so a page load starts with
    // nothing. Exchange the HttpOnly hb-refresh cookie for a fresh token.
    // Plugin UIs use their own short-lived, single-use tickets (#2893).
    //
    // A failure here is the normal "not signed in" case — the route guards send
    // the user to /login — so it must never throw and block boot.
    try {
      const resp = await this.$api.post('/auth/session', {}, { withCredentials: true })
      if (resp?.access_token) {
        setStoredToken(resp.access_token)
        this.validateToken(resp.access_token)
        // ⚠️ Re-read the settings now that a token exists. GET /auth/settings
        // returns a REDUCED object to unauthenticated callers — `enableAccessories`,
        // `enableTerminalAccess`, `restrictLogsToAdmins` and friends are only sent
        // to an authorised request (see ConfigService.uiSettings). SettingsService
        // fires its first fetch from its own constructor, which now runs before
        // this method has a token, so without this second fetch the whole session
        // ran on the pre-login subset — the accessories page told users to turn on
        // insecure mode even though it was already on. login()/noauth() do the
        // same thing for the same reason.
        //
        // Awaited deliberately: tokenReady must not resolve until the authorised
        // settings are in place, because the route guards gate on it.
        await this.$settings.getAppSettings()
      }
    } catch {
      setStoredToken(null)
      this.token = null
    }
  }

  public async checkToken() {
    // First do a quick client-side check if token is expired to avoid API call
    if (!this.token || this.$jwtHelper.isTokenExpired(this.token, this.$settings.serverTimeOffset)) {
      console.warn('Token expired on client side, logging out immediately')
      this.logout()
      return
    }

    try {
      return await this.$api.get('/auth/check')
    } catch (err: any) {
      if (err.status === 401) {
        // Token is no longer valid on server side, perform logout
        console.warn('Current token is not valid on server')
        this.logout()
      }

      // Re-throw to let the interceptor handle it
      throw err
    }
  }

  public isLoggedIn() {
    if (this.$settings.env.instanceId !== this.user.instanceId) {
      console.error('Token does not match instance')
      return false
    }
    return (this.user && this.token && !this.$jwtHelper.isTokenExpired(this.token, this.$settings.serverTimeOffset))
  }

  private validateToken(token: string) {
    try {
      if (this.$jwtHelper.isTokenExpired(token, this.$settings.serverTimeOffset)) {
        this.logout()
        return
      }
      this.user = this.$jwtHelper.decodeToken(token) ?? ({} as UserInterface)
      this.token = token
      this.setLogoutTimer()

      // Check if user has legacy OTP secret and emit notification
      if (this.user.otpLegacySecret) {
        this.$notification.legacyOtpDetected.set(true)
      }

      return true
    } catch (e) {
      setStoredToken(null)
      this.token = null
      return false
    }
  }

  private setLogoutTimer() {
    clearTimeout(this.logoutTimer)
    if (this.token && !this.$jwtHelper.isTokenExpired(this.token, this.$settings.serverTimeOffset)) {
      // setTimeout accepts a signed 32-bit ms count (max ≈ 24.8 days).
      // sessionTimeout is admin-configurable seconds; values that produce
      // a larger ms count silently never timeout — and silently is the
      // problem. Clamp to the 32-bit ceiling so the timer always arms,
      // and log a warning so the admin understands the effective max.
      const TIMER_MAX_MS = 2147483647
      const requested = this.$settings.sessionTimeout * 1000
      const inactivityTimeout = Math.min(requested, TIMER_MAX_MS)
      if (requested > TIMER_MAX_MS) {
        console.warn(`Inactivity timeout ${this.$settings.sessionTimeout}s exceeds the browser setTimeout limit; clamped to ~24.8 days.`)
      }
      this.logoutTimer = setTimeout(async () => {
        if (this.$settings.formAuth === false) {
          // Guard the auto-reload with a per-session budget so a recurring
          // failure (network down, server bouncing) can't trap the tab in
          // an endless reload loop.
          const COUNTER_KEY = 'uix.noauthReloadCount'
          const RELOAD_BUDGET = 3
          const count = Number(window.sessionStorage.getItem(COUNTER_KEY) ?? '0') + 1
          if (count > RELOAD_BUDGET) {
            console.warn('Skipping noauth re-login reload — retry budget exhausted this session.')
            return
          }
          try {
            await this.noauth()
            window.sessionStorage.setItem(COUNTER_KEY, String(count))
            window.location.reload()
          } catch (e) {
            console.warn('noauth re-login failed:', e)
          }
        } else {
          // Nobody chose this logout - end this browser's session, not the
          // account's sessions on every other device
          this.logout({ scope: 'local' })
        }
      }, inactivityTimeout)
    }
  }

  /**
   * Check if the session needs to be refreshed and do so if needed
   * Called on user navigation/interaction
   */
  public async checkAndRefreshIfNeeded(): Promise<void> {
    // Only perform refresh if form auth is enabled and the feature is enabled
    if (!this.$settings.formAuth || !this.$settings.sessionTimeoutInactivityBased) {
      return
    }

    if (!this.token || !this.isLoggedIn() || this.isRefreshing) {
      return
    }

    const now = Date.now()
    const timeSinceLastRefresh = now - this.lastRefreshTime
    const sessionTimeoutMs = this.$settings.sessionTimeout * 1000
    const refreshThreshold = sessionTimeoutMs * 0.7 // Refresh when 70% of timeout has elapsed

    // Only refresh if we're past the threshold since last refresh
    if (timeSinceLastRefresh > refreshThreshold) {
      try {
        await this.refreshSession('session-extension')
      } catch (err) {
        console.error('Failed to refresh session:', err)
        // On error, the user will be logged out when the timer expires
      }
    }
  }

  /**
   * Refresh the current session by getting a new token
   * @param reason - optional allowlisted reason for distinct server log lines
   */
  public async refreshSession(reason?: 'admin-guard' | 'session-extension' | 'profile-update') {
    if (this.isRefreshing) {
      return
    }

    this.isRefreshing = true

    try {
      const resp = await this.$api.post('/auth/refresh', reason ? { reason } : {}, { withCredentials: true })
      if (resp.access_token) {
        // Hold the new token in memory; AuthHelperService reads through to
        // the same store, so there is nothing further to keep in step.
        setStoredToken(resp.access_token)
        this.$tokenCache.invalidateCache()
        // Re-run validateToken so this.user is re-decoded from the new
        // payload. Otherwise admin demotion / OTP-legacy state would
        // persist in memory until full reload. validateToken also resets
        // the logout timer.
        if (!this.validateToken(resp.access_token)) {
          throw new Error('Refreshed access token failed validation')
        }
        // Update the last refresh timestamp
        this.lastRefreshTime = Date.now()
      }
    } finally {
      this.isRefreshing = false
    }
  }
}
