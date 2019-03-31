import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { JwtHelperService } from '@auth0/angular-jwt';
import * as dayjs from 'dayjs';
import { ApiService } from './api.service';
import { environment } from '../../environments/environment';

interface UserInterface {
  token?: string;
  username?: string;
  name?: string;
  admin?: boolean;
}

@Injectable()
export class AuthService {
  public env: any = {};
  public formAuth = true;
  public theme: string;
  public token: string;
  public user: UserInterface = {};
  private logoutTimer;

  constructor(
    private $jwtHelper: JwtHelperService,
    private $api: ApiService,
    private titleService: Title
  ) {
    // load the token (if present) from local storage on page init
    this.loadToken();
    this.getAppSettings();
  }

  login(username: string, password: string) {
    return this.$api.post('/auth/login', { username, password })
      .toPromise()
      .then((resp) => {
        if (!this.validateToken(resp.access_token)) {
          throw new Error('Invalid username or password.');
        } else {
          window.localStorage.setItem(environment.jwt.tokenKey, resp.access_token);
        }
      });
  }

  logout() {
    this.user = null;
    this.token = null;
    window.localStorage.removeItem(environment.jwt.tokenKey);
    window.location.reload();
  }

  loadToken() {
    const token = window.localStorage.getItem(environment.jwt.tokenKey);
    if (token) {
      this.validateToken(token);
    }
  }

  validateToken(token: string) {
    try {
      this.user = this.$jwtHelper.decodeToken(token);
      this.token = token;
      this.setLogoutTimer();
      return true;
    } catch (e) {
      window.localStorage.removeItem(environment.jwt.tokenKey);
      this.token = null;
      return false;
    }
  }

  setLogoutTimer() {
    clearTimeout(this.logoutTimer);
    if (!this.$jwtHelper.isTokenExpired(this.token)) {
      const expires = dayjs(this.$jwtHelper.getTokenExpirationDate(this.token));
      const timeout = expires.diff(dayjs(), 'millisecond');
      this.logoutTimer = setTimeout(() => {
        this.logout();
      }, timeout);
    }
  }

  isLoggedIn() {
    return this.user && this.token && !this.$jwtHelper.isTokenExpired(this.token);
  }

  refreshToken() {
    return this.$api.getToken().toPromise()
      .then((user: any) => {
        window.localStorage.setItem('token', user.token);
        return this.validateToken(user.token);
      });
  }

  getAppSettings() {
    return this.$api.getAppSettings().toPromise()
      .then((data: any) => {
        this.formAuth = data.formAuth;
        this.env = data.env;
        this.setTheme(data.theme || 'red');
        this.setTitle(data.env.homebridgeInstanceName);
      });
  }

  setTheme(theme: string) {
    if (this.theme) {
      window.document.querySelector('body').classList.remove(`config-ui-x-${this.theme}`);
    }
    this.theme = theme;
    window.document.querySelector('body').classList.add(`config-ui-x-${this.theme}`);
  }

  setTitle(title: string) {
    this.titleService.setTitle(title || 'Homebridge');
  }
}
