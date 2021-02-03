import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { first } from 'rxjs/operators';
import * as dayjs from 'dayjs';

import { ApiService } from '@/app/core/api.service';

interface EnvInterface {
  platform: 'darwin' | 'win32' | 'linux' | 'freebsd';
  ableToConfigureSelf: boolean;
  enableAccessories: boolean;
  enableTerminalAccess: boolean;
  homebridgeInstanceName: string;
  homebridgeVersion?: string;
  nodeVersion: string;
  packageName: string;
  packageVersion: string;
  runningInDocker: boolean;
  runningInLinux: boolean;
  dockerOfflineUpdate: boolean;
  serviceMode: boolean;
  lang: string | null;
  temperatureUnits: 'c' | 'f';
  instanceId: string;
  customWallpaperHash: string;
}

interface AppSettingsInterface {
  env: EnvInterface;
  formAuth: boolean;
  theme: string;
  serverTimestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  public env: EnvInterface = {} as EnvInterface;
  public formAuth = true;
  public uiVersion: string;
  public theme: string;

  // track to see if settings have been loaded
  private settingsLoadedSubject = new Subject();
  public onSettingsLoaded = this.settingsLoadedSubject.pipe(first());
  public settingsLoaded = false;

  constructor(
    private $api: ApiService,
    private $title: Title,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {
    this.getAppSettings();
  }

  getAppSettings() {
    return this.$api.get('/auth/settings').toPromise()
      .then((data: AppSettingsInterface) => {
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

    const bodySelector = window.document.querySelector('body');
    if (this.theme) {
      bodySelector.classList.remove(`config-ui-x-${this.theme}`);
      bodySelector.classList.remove(`dark-mode`);
    }
    this.theme = theme;
    bodySelector.classList.add(`config-ui-x-${this.theme}`);
    if (this.theme.startsWith('dark-mode')) {
      bodySelector.classList.add(`dark-mode`);
    }
  }

  setTitle(title: string) {
    this.$title.setTitle(title || 'Homebridge');
  }

  setUiVersion(version) {
    if (!this.uiVersion) {
      this.uiVersion = version;
    }
  }

  setLang(lang: string) {
    if (lang) {
      this.$translate.use(lang);
    }
  }

  /**
   * Check to make sure the server time is roughly the same as the client time.
   * A warning is shown if the time difference is >= 4 hours.
   *
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

