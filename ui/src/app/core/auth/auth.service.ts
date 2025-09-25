/* global NodeJS */
import { inject, Injectable } from '@angular/core'
import { JwtHelperService } from '@auth0/angular-jwt'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { UserInterface } from '@/app/core/auth/auth.interfaces'
import { SettingsService } from '@/app/core/settings.service'
import { environment } from '@/environments/environment'

@Injectable()
export class AuthService {
  private $api = inject(ApiService)
  private $jwtHelper = inject(JwtHelperService)
  private $settings = inject(SettingsService)

  public token: string
  public user: UserInterface = {}
  private logoutTimer: NodeJS.Timeout
  private lastRefreshTime: number = Date.now()
  private isRefreshing: boolean = false

  constructor() {
    // Load the token (if present) from local storage on page init
    this.loadToken()
  }

  public async login(form: { username: string, password: string, ota?: string }) {
    const resp = await firstValueFrom(this.$api.post('/auth/login', form))
    if (!this.validateToken(resp.access_token)) {
      throw new Error('Invalid username or password.')
    }
    window.localStorage.setItem(environment.jwt.tokenKey, resp.access_token)
    await this.$settings.getAppSettings() // update settings to get full settings object
  }

  public async noauth() {
    const resp = await firstValueFrom(this.$api.post('/auth/noauth', {}))
    if (!this.validateToken(resp.access_token)) {
      throw new Error('Invalid username or password.')
    } else {
      window.localStorage.setItem(environment.jwt.tokenKey, resp.access_token)
      await this.$settings.getAppSettings() // update settings to get full settings
    }
  }

  public logout() {
    this.user = null
    this.token = null
    clearTimeout(this.logoutTimer)
    window.localStorage.removeItem(environment.jwt.tokenKey)
    window.location.reload()
  }

  public async loadToken() {
    if (!this.$settings.settingsLoaded) {
      await firstValueFrom(this.$settings.onSettingsLoaded)
    }
    const token = window.localStorage.getItem(environment.jwt.tokenKey)
    if (token) {
      this.validateToken(token)
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
      return await firstValueFrom(this.$api.get('/auth/check'))
    } catch (err) {
      if (err.status === 401) {
        // Token is no longer valid on server side, do logout
        console.error('Current token is not valid on server')
        this.logout()
      }
      throw err // Re-throw to let the interceptor handle it
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
      }
      this.user = this.$jwtHelper.decodeToken(token)
      this.token = token
      this.setLogoutTimer()
      return true
    } catch (e) {
      window.localStorage.removeItem(environment.jwt.tokenKey)
      this.token = null
      return false
    }
  }

  private setLogoutTimer() {
    clearTimeout(this.logoutTimer)
    if (!this.$jwtHelper.isTokenExpired(this.token, this.$settings.serverTimeOffset)) {
      // Use sessionTimeout as inactivity timeout
      const inactivityTimeout = this.$settings.sessionTimeout * 1000 // Convert to milliseconds

      // Set timeout only accepts a 32bit integer, if the number is larger than this, do not time out
      if (inactivityTimeout <= 2147483647) {
        this.logoutTimer = setTimeout(async () => {
          if (this.$settings.formAuth === false) {
            await this.noauth()
            window.location.reload()
          } else {
            this.logout()
          }
        }, inactivityTimeout)
      }
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
        await this.refreshSession()
      } catch (err) {
        console.error('Failed to refresh session:', err)
        // On error, the user will be logged out when the timer expires
      }
    }
  }

  /**
   * Refresh the current session by getting a new token
   */
  private async refreshSession() {
    if (this.isRefreshing) {
      return
    }

    this.isRefreshing = true

    try {
      const resp = await firstValueFrom(this.$api.post('/auth/refresh', {}))
      if (resp.access_token) {
        this.token = resp.access_token
        window.localStorage.setItem(environment.jwt.tokenKey, resp.access_token)
        // Update the last refresh timestamp
        this.lastRefreshTime = Date.now()
        // Reset the logout timer with the new session timeout
        this.setLogoutTimer()
      }
    } finally {
      this.isRefreshing = false
    }
  }
}
