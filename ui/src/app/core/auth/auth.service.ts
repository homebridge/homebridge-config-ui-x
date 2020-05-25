import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { JwtHelperService } from '@auth0/angular-jwt';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import * as dayjs from 'dayjs';
import { ApiService } from '../api.service';
import { environment } from '../../../environments/environment';
import { Observable, Subject } from 'rxjs';
import { first } from 'rxjs/operators';

interface UserInterface {
  username?: string;
  name?: string;
  admin?: boolean;
  instanceId?: string;
}

interface EnvInterface {
  platform: 'darwin' | 'win32' | 'linux' | 'freebsd';
  ableToConfigureSelf: boolean;
  enableAccessories: boolean;
  enableTerminalAccess: boolean;
  homebridgeInstanceName: string;
  nodeVersion: string;
  packageName: string;
  packageVersion: string;
  runningInDocker: boolean;
  runningInLinux: boolean;
  dockerOfflineUpdate: boolean;
  serviceMode: boolean;
  lang: string | null;
  temperatureUnits: string;
  instanceId: string;
  customWallpaperHash: string;
}

@Injectable()
export class AuthService {
  public env: EnvInterface = {} as EnvInterface;
  public uiVersion: string;
  public formAuth = true;
  public theme: string;
  public token: string;
  public user: UserInterface = {};
  private logoutTimer;

  // track to see if settings have been loaded
  private settingsLoadedSubject = new Subject();
  public onSettingsLoaded = this.settingsLoadedSubject.pipe(first());
  public settingsLoaded = false;

  constructor(
    private $jwtHelper: JwtHelperService,
    private $api: ApiService,
    private $toastr: ToastrService,
    private titleService: Title,
    private translate: TranslateService,
  ) {
    // load the token (if present) from local storage on page init
    this.loadToken();
    this.getAppSettings();
  }

  login(form: { username: string, password: string, ota?: string }) {
    return this.$api.post('/auth/login', form)
      .toPromise()
      .then((resp) => {
        if (!this.validateToken(resp.access_token)) {
          throw new Error('Invalid username or password.');
        } else {
          window.localStorage.setItem(environment.jwt.tokenKey, resp.access_token);
        }
      });
  }

  noauth() {
    return this.$api.post('/auth/noauth', {})
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
      if (this.$jwtHelper.isTokenExpired(token)) {
        this.logout();
      }
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

  checkToken() {
    return this.$api.get('/auth/check').toPromise()
      .catch((err: any) => {
        if (err.status === 401) {
          // token is no longer valid, do logout
          console.error('Current token is not valid');
          this.logout();
        }
      });
  }

  setLogoutTimer() {
    clearTimeout(this.logoutTimer);
    if (!this.$jwtHelper.isTokenExpired(this.token)) {
      const expires = dayjs(this.$jwtHelper.getTokenExpirationDate(this.token));
      const timeout = expires.diff(dayjs(), 'millisecond');
      // setTimeout only accepts a 32bit integer, if the number is larger than this, do not timeout
      if (timeout <= 2147483647) {
        this.logoutTimer = setTimeout(() => {
          if (this.formAuth === false) {
            this.noauth();
          } else {
            this.logout();
          }
        }, timeout);
      }
    }
  }

  isLoggedIn() {
    if (this.env.instanceId !== this.user.instanceId) {
      console.error('Token does not match instance');
      return false;
    }
    return (this.user && this.token && !this.$jwtHelper.isTokenExpired(this.token));
  }

  getAppSettings() {
    return this.$api.get('/auth/settings').toPromise()
      .then((data: any) => {
        this.formAuth = data.formAuth;
        this.env = data.env;
        this.setTheme(data.theme || 'auto');
        this.setTitle(this.env.homebridgeInstanceName);
        this.checkServerTime(data.serverTimestamp);
        this.setUiVersion(data.env.packageVersion);
        this.setLang(this.env.lang);
        this.settingsLoaded = true;
        this.settingsLoadedSubject.next();
      });
  }

  setTheme(theme: string) {
    if (theme === 'auto') {
      // select theme based on os dark mode preferences
      try {
        if (matchMedia('(prefers-color-scheme: dark)').matches) {
          theme = 'dark-mode';
        } else {
          theme = 'purple';
        }
      } catch (e) {
        theme = 'purple';
      }
    }
    if (this.theme) {
      window.document.querySelector('body').classList.remove(`config-ui-x-${this.theme}`);
    }
    this.theme = theme;
    window.document.querySelector('body').classList.add(`config-ui-x-${this.theme}`);
  }

  setTitle(title: string) {
    this.titleService.setTitle(title || 'Homebridge');
  }

  setUiVersion(version) {
    if (!this.uiVersion) {
      this.uiVersion = version;
    }
  }

  setLang(lang: string) {
    if (lang) {
      this.translate.use(lang);
    }
  }

  /**
   * Check to make sure the server time is roughly the same as the client time.
   * A warning is shown if the time difference is >= 4 hours.
   * @param timestamp
   */
  checkServerTime(timestamp: string) {
    const serverTime = dayjs(timestamp);
    const diff = serverTime.diff(dayjs(), 'hour');
    if (diff >= 4 || diff <= -4) {
      const msg = 'The date and time on your Homebridge server is different to your browser. This may cause login issues.';
      console.error(msg);
      this.$toastr.warning(msg);
    }
  }
}
