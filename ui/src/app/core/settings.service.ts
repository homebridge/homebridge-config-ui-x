import { inject, Injectable } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { TranslateService } from '@ngx-translate/core'
import dayjs from 'dayjs'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Subject } from 'rxjs'
import { first } from 'rxjs/operators'

import { ApiService } from '@/app/core/api.service'

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
  temp?: string
  port: number
  instanceId: string
  customWallpaperHash: string
  setupWizardComplete: boolean
  recommendChildBridges: boolean
  usePnpm: boolean
  scheduledBackupDisable: boolean
  scheduledBackupPath: string
  log?: {
    maxSize?: number
    truncateSize?: number
  }
  ssl?: {
    key?: string
    cert?: string
    pfx?: string
    passphrase?: string
  }
  accessoryControl?: {
    debug?: boolean
    instanceBlacklist?: string[]
  }
  plugins?: {
    hideUpdatesFor?: string[]
  }
  linux?: {
    shutdown?: string
    restart?: string
  }
  host?: string
  proxyHost?: string
  homebridgePackagePath?: string
  disableServerMetricsMonitoring?: boolean
}

interface AppSettingsInterface {
  env: EnvInterface
  formAuth: boolean
  sessionTimeout: number
  theme: string
  lightingMode: 'auto' | 'light' | 'dark'
  menuMode: 'default' | 'freeze'
  wallpaper: string
  serverTimestamp: string
}

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private $api = inject(ApiService)
  private $title = inject(Title)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public env: EnvInterface = {} as EnvInterface
  public formAuth = true
  public sessionTimeout = 28800
  public uiVersion: string
  public theme: string
  public lightingMode: 'auto' | 'light' | 'dark'
  public currentLightingMode: 'auto' | 'light' | 'dark'
  public actualLightingMode: 'light' | 'dark'
  public browserLightingMode: 'light' | 'dark'
  public menuMode: 'default' | 'freeze'
  public wallpaper: string
  public serverTimeOffset = 0
  private readonly defaultTheme = 'deep-purple'
  public readonly themeList = [
    'orange',
    'red',
    'pink',
    'purple',
    'deep-purple',
    'indigo',
    'blue',
    'blue-grey',
    'cyan',
    'green',
    'teal',
    'grey',
    'brown',
  ]

  // Set true if current translation is RLT
  public rtl = false

  // Track to see if settings have been loaded
  private settingsLoadedSubject = new Subject()
  public onSettingsLoaded = this.settingsLoadedSubject.pipe(first())
  public settingsLoaded = false

  private forbiddenKeys = ['__proto__', 'constructor', 'prototype']

  constructor() {
    this.getAppSettings()
  }

  async getAppSettings() {
    const data = await firstValueFrom(this.$api.get('/auth/settings')) as AppSettingsInterface
    this.formAuth = data.formAuth
    this.sessionTimeout = data.sessionTimeout
    this.env = data.env
    this.lightingMode = data.lightingMode
    this.wallpaper = data.wallpaper
    this.setLightingMode(this.lightingMode, 'user')
    this.setTheme(data.theme)
    this.setMenuMode(data.menuMode)
    this.setTitle(this.env.homebridgeInstanceName)
    this.checkServerTime(data.serverTimestamp)
    this.setUiVersion(data.env.packageVersion)
    this.setLang(this.env.lang)
    this.settingsLoaded = true
    this.settingsLoadedSubject.next(undefined)
  }

  setBrowserLightingMode(lighting: 'light' | 'dark') {
    this.browserLightingMode = lighting
    if (this.lightingMode === 'auto') {
      this.setLightingMode(lighting, 'browser')
    }
  }

  setLightingMode(lightingMode: 'auto' | 'light' | 'dark', source: 'user' | 'browser') {
    if (source === 'user') {
      this.lightingMode = lightingMode
    }
    this.currentLightingMode = lightingMode
    this.actualLightingMode = this.currentLightingMode === 'auto' ? this.browserLightingMode : this.currentLightingMode
    if (this.theme) {
      this.setTheme(this.theme)
    }
  }

  setTheme(theme: string) {
    // Default theme is deep-purple
    if (!theme || !this.themeList.includes(theme)) {
      theme = this.defaultTheme

      // Save the new property to the config file
      firstValueFrom(this.$api.put('/config-editor/ui', { key: 'theme', value: theme }))
        .catch(error => console.error(error))
    }

    // Grab the body element
    const bodySelector = window.document.querySelector('body')

    // Remove all existing theme classes
    bodySelector.classList.remove(`config-ui-x-${this.theme}`)
    bodySelector.classList.remove(`config-ui-x-dark-mode-${this.theme}`)

    // Set the new theme
    this.theme = theme
    if (this.actualLightingMode === 'dark') {
      bodySelector.classList.add(`config-ui-x-dark-mode-${this.theme}`)
      if (!bodySelector.classList.contains('dark-mode')) {
        bodySelector.classList.add('dark-mode')
      }
    } else {
      bodySelector.classList.add(`config-ui-x-${this.theme}`)
      if (bodySelector.classList.contains('dark-mode')) {
        bodySelector.classList.remove('dark-mode')
      }
    }
  }

  setMenuMode(value: 'default' | 'freeze') {
    this.menuMode = value
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
    } else {
      lang = 'auto'
    }
    this.env.lang = lang
  }

  setItem(key: string, value: any) {
    this[key] = value
  }

  setEnvItem(key: string, value: any) {
    // If the key contains a dot, we assume it's a nested property
    if (key.includes('.')) {
      const keys = key.split('.')
      let current = this.env
      for (let i = 0; i < keys.length - 1; i++) {
        if (this.forbiddenKeys.includes(keys[i])) {
          return
        }
        if (!current[keys[i]]) {
          current[keys[i]] = {}
        }
        current = current[keys[i]]
      }
      if (!this.forbiddenKeys.includes(keys[keys.length - 1])) {
        current[keys[keys.length - 1]] = value
      }
    } else {
      this.env[key] = value
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
      const toast = this.$toastr.warning(
        this.$translate.instant('settings.datetime.incorrect'),
        this.$translate.instant('toast.title_warning'),
        {
          timeOut: 20000,
          tapToDismiss: false,
        },
      )
      toast.onTap.subscribe(() => {
        window.open('https://homebridge.io/w/JqTFs', '_blank')
      })
    }
  }
}
