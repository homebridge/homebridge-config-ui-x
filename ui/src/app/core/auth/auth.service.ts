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
  private activityCheckTimer: NodeJS.Timeout
  private lastActivity: number = Date.now()
  private isRefreshing: boolean = false

  constructor() {
    // Load the token (if present) from local storage on page init
    this.loadToken()
    // Start monitoring user activity
    this.initActivityMonitoring()
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
    clearTimeout(this.activityCheckTimer)
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
    try {
      return await firstValueFrom(this.$api.get('/auth/check'))
    } catch (err) {
      if (err.status === 401) {
        // Token is no longer valid, do logout
        console.error('Current token is not valid')
        this.logout()
      }
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
    clearTimeout(this.activityCheckTimer)

    if (!this.$jwtHelper.isTokenExpired(this.token, this.$settings.serverTimeOffset)) {
      // Instead of using JWT expiration, use sessionTimeout as inactivity timeout
      const inactivityTimeout = this.$settings.sessionTimeout * 1000 // Convert to milliseconds

      // SetTimeout only accepts a 32bit integer, if the number is larger than this, do not time out
      if (inactivityTimeout <= 2147483647) {
        this.logoutTimer = setTimeout(async () => {
          if (this.$settings.formAuth === false) {
            await this.noauth()
            window.location.reload()
          } else {
            this.logout()
          }
        }, inactivityTimeout)

        // Check for activity periodically and refresh session if needed
        this.startActivityCheck()
      }
    }
  }

  /**
   * Initialize activity monitoring
   */
  private initActivityMonitoring() {
    if (typeof window !== 'undefined') {
      // Listen for user activity events
      const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']

      activityEvents.forEach((event) => {
        document.addEventListener(event, () => this.recordActivity(), { passive: true })
      })
    }
  }

  /**
   * Record user activity timestamp
   */
  private recordActivity() {
    this.lastActivity = Date.now()
  }

  /**
   * Start periodic activity checking
   */
  private startActivityCheck() {
    // Check every 5 minutes if we need to refresh the session
    this.activityCheckTimer = setInterval(() => {
      this.checkAndRefreshSession()
    }, 5 * 60 * 1000) // 5 minutes
  }

  /**
   * Check if session needs refresh based on activity
   */
  private async checkAndRefreshSession() {
    if (!this.token || !this.isLoggedIn() || this.isRefreshing) {
      return
    }

    const now = Date.now()
    const timeSinceActivity = now - this.lastActivity
    const sessionTimeoutMs = this.$settings.sessionTimeout * 1000

    // If there was recent activity and we're past halfway to timeout, refresh the session
    if (timeSinceActivity < sessionTimeoutMs && timeSinceActivity < sessionTimeoutMs / 2) {
      try {
        await this.refreshSession()
      } catch (err) {
        console.error('Failed to refresh session:', err)
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
        // Reset the logout timer with the new token
        this.setLogoutTimer()
      }
    } finally {
      this.isRefreshing = false
    }
  }
}
