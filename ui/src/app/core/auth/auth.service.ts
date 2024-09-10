import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'
import { environment } from '@/environments/environment'
import { Injectable } from '@angular/core'
import { JwtHelperService } from '@auth0/angular-jwt'
import * as dayjs from 'dayjs'

interface UserInterface {
  username?: string
  name?: string
  admin?: boolean
  instanceId?: string
}

@Injectable()
export class AuthService {
  public token: string
  public user: UserInterface = {}
  private logoutTimer

  constructor(
    private $jwtHelper: JwtHelperService,
    private $api: ApiService,
    private $settings: SettingsService,
  ) {
    // load the token (if present) from local storage on page init
    this.loadToken()
  }

  login(form: { username: string, password: string, ota?: string }) {
    return this.$api.post('/auth/login', form).toPromise().then((resp) => {
      if (!this.validateToken(resp.access_token)) {
        throw new Error('Invalid username or password.')
      } else {
        window.localStorage.setItem(environment.jwt.tokenKey, resp.access_token)
      }
    })
  }

  noauth() {
    return this.$api.post('/auth/noauth', {}).toPromise().then((resp) => {
      if (!this.validateToken(resp.access_token)) {
        throw new Error('Invalid username or password.')
      } else {
        window.localStorage.setItem(environment.jwt.tokenKey, resp.access_token)
      }
    })
  }

  logout() {
    this.user = null
    this.token = null
    window.localStorage.removeItem(environment.jwt.tokenKey)
    window.location.reload()
  }

  async loadToken() {
    if (!this.$settings.settingsLoaded) {
      await this.$settings.onSettingsLoaded.toPromise()
    }
    const token = window.localStorage.getItem(environment.jwt.tokenKey)
    if (token) {
      this.validateToken(token)
    }
  }

  validateToken(token: string) {
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

  checkToken() {
    return this.$api.get('/auth/check').toPromise().catch((err: any) => {
      if (err.status === 401) {
        // token is no longer valid, do logout
        console.error('Current token is not valid')
        this.logout()
      }
    })
  }

  setLogoutTimer() {
    clearTimeout(this.logoutTimer)
    if (!this.$jwtHelper.isTokenExpired(this.token, this.$settings.serverTimeOffset)) {
      const expires = dayjs(this.$jwtHelper.getTokenExpirationDate(this.token))
      const timeout = expires.diff(dayjs().add(this.$settings.serverTimeOffset, 's'), 'millisecond')
      // setTimeout only accepts a 32bit integer, if the number is larger than this, do not time out
      if (timeout <= 2147483647) {
        this.logoutTimer = setTimeout(async () => {
          if (this.$settings.formAuth === false) {
            await this.noauth()
            window.location.reload()
          } else {
            this.logout()
          }
        }, timeout)
      }
    }
  }

  isLoggedIn() {
    if (this.$settings.env.instanceId !== this.user.instanceId) {
      console.error('Token does not match instance')
      return false
    }
    return (this.user && this.token && !this.$jwtHelper.isTokenExpired(this.token, this.$settings.serverTimeOffset))
  }
}
