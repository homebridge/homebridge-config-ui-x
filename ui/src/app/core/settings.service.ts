import { ApiService } from '@/app/core/api.service'
import { Injectable } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { TranslateService } from '@ngx-translate/core'
import * as dayjs from 'dayjs'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'
import { first } from 'rxjs/operators'

interface EnvInterface {
  platform: 'darwin' | 'win32' | 'linux' | 'freebsd'
  enableAccessories: boolean
  enableTerminalAccess: boolean
  homebridgeInstanceName: string
  homebridgeVersion?: string
  homebridgeUiVersion?: string
  nodeVersion: string
  packageName: string
  packageVersion: string
  runningInDocker: boolean
  runningInLinux: boolean
  runningInFreeBSD: boolean
  runningInSynologyPackage: boolean
  runningInPackageMode: boolean
  runningOnRaspberryPi: boolean
  canShutdownRestartHost: boolean
  dockerOfflineUpdate: boolean
  serviceMode: boolean
  lang: string | null
  temperatureUnits: 'c' | 'f'
  instanceId: string
  customWallpaperHash: string
  setupWizardComplete: boolean
  recommendChildBridges: boolean
}

interface AppSettingsInterface {
  env: EnvInterface
  formAuth: boolean
  theme: string
  serverTimestamp: string
}

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  public env: EnvInterface = {} as EnvInterface
  public formAuth = true
  public uiVersion: string
  public theme: string
  public serverTimeOffset = 0

  // set true if current translation is RLT
  public rtl = false

  // track to see if settings have been loaded
  private settingsLoadedSubject = new Subject()
  public onSettingsLoaded = this.settingsLoadedSubject.pipe(first())
  public settingsLoaded = false

  constructor(
    private $api: ApiService,
    private $title: Title,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {
    this.getAppSettings()
  }

  async getAppSettings() {
    const data = await this.$api.get('/auth/settings').toPromise() as AppSettingsInterface
    this.formAuth = data.formAuth
    this.env = data.env
    this.setTheme(data.theme || 'auto')
    this.setTitle(this.env.homebridgeInstanceName)
    this.checkServerTime(data.serverTimestamp)
    this.setUiVersion(data.env.packageVersion)
    this.setLang(this.env.lang)
    this.settingsLoaded = true
    this.settingsLoadedSubject.next(undefined)
  }

  setTheme(theme: string) {
    if (theme === 'auto') {
      // select theme based on os dark mode preferences
      try {
        if (matchMedia('(prefers-color-scheme: dark)').matches) {
          theme = 'dark-mode'
        } else {
          theme = 'purple'
        }
      } catch (e) {
        theme = 'purple'
      }
    }

    const bodySelector = window.document.querySelector('body')
    if (this.theme) {
      bodySelector.classList.remove(`config-ui-x-${this.theme}`)
      bodySelector.classList.remove('dark-mode')
    }
    this.theme = theme
    bodySelector.classList.add(`config-ui-x-${this.theme}`)
    if (this.theme.startsWith('dark-mode')) {
      bodySelector.classList.add('dark-mode')
    }
  }

  setTitle(title: string) {
    this.$title.setTitle(title || 'Homebridge')
  }

  setUiVersion(version: string) {
    if (!this.uiVersion) {
      this.uiVersion = version
    }
  }

  setLang(lang: string) {
    if (lang) {
      this.$translate.use(lang)
    }
  }

  /**
   * Check to make sure the server time is roughly the same as the client time.
   * A warning is shown if the time difference is >= 4 hours.
   *
   * @param timestamp
   */
  checkServerTime(timestamp: string) {
    const serverTime = dayjs(timestamp)
    const diff = serverTime.diff(dayjs(), 'hour')
    this.serverTimeOffset = diff * 60 * 60
    if (diff >= 8 || diff <= -8) {
      const msg = 'The date and time on your Homebridge server seems to be incorrect. This may cause unexpected issues.'
      const toastMsg = `${msg} ` + '<br><br><u>Click here for more information.</u>'
      console.error(msg, 'Server time offset of', this.serverTimeOffset, 'seconds applied.')
      const toast = this.$toastr.warning(toastMsg, null, { timeOut: 20000, enableHtml: true, tapToDismiss: false })
      toast.onTap.subscribe(() => {
        window.open('https://homebridge.io/w/JqTFs', '_blank')
      })
    }
  }
}
