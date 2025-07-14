import { inject, Injectable } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { TranslateService } from '@ngx-translate/core'
import dayjs from 'dayjs'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Subject } from 'rxjs'
import { first } from 'rxjs/operators'

import { ApiService } from '@/app/core/api.service'
import { AppSettingsInterface, EnvInterface } from '@/app/core/settings.interfaces'

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private $api = inject(ApiService)
  private $title = inject(Title)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private settingsLoadedSubject = new Subject()
  private readonly defaultTheme = 'deep-purple'
  private forbiddenKeys = ['__proto__', 'constructor', 'prototype']

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
  public terminalPersistence = false
  public terminalShowWarning = false
  public terminalBufferSize = globalThis.terminal.bufferSize
  public serverTimeOffset = 0
  public rtl = false // set true if current translation is RLT
  public onSettingsLoaded = this.settingsLoadedSubject.pipe(first())
  public settingsLoaded = false
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

  constructor() {
    this.getAppSettings()
  }

  public async getAppSettings() {
    const data = await firstValueFrom(this.$api.get('/auth/settings')) as AppSettingsInterface
    this.formAuth = data.formAuth
    this.sessionTimeout = data.sessionTimeout
    this.env = data.env
    this.lightingMode = data.lightingMode
    this.wallpaper = data.wallpaper
    this.terminalPersistence = data.terminalPersistence === true // default to false
    this.terminalShowWarning = data.terminalShowWarning === true // default to false
    this.terminalBufferSize = data.terminalBufferSize || globalThis.terminal.bufferSize
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

  public setBrowserLightingMode(lighting: 'light' | 'dark') {
    this.browserLightingMode = lighting
    if (this.lightingMode === 'auto') {
      this.setLightingMode(lighting, 'browser')
    }
  }

  public setLightingMode(lightingMode: 'auto' | 'light' | 'dark', source: 'user' | 'browser') {
    if (source === 'user') {
      this.lightingMode = lightingMode
    }
    this.currentLightingMode = lightingMode
    this.actualLightingMode = this.currentLightingMode === 'auto' ? this.browserLightingMode : this.currentLightingMode
    if (this.theme) {
      this.setTheme(this.theme)
    }
  }

  public setTheme(theme: string) {
    // Default theme is deep-purple
    if (!theme || !this.themeList.includes(theme)) {
      theme = this.defaultTheme

      // Save the new property to the config file
      firstValueFrom(this.$api.put('/config-editor/ui', { key: 'theme', value: theme }))
        .catch(error => console.error('Error saving setTheme:', error))
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

    // Update same-origin iframes
    const iframes = window.document.querySelectorAll('iframe')
    iframes.forEach((iframe, index) => {
      try {
        const iframeDoc = iframe.contentDocument
        if (iframeDoc) {
          const iframeBody = iframeDoc.body

          iframeBody.classList.remove(`config-ui-x-${this.theme}`)
          iframeBody.classList.remove(`config-ui-x-dark-mode-${this.theme}`)
          if (this.actualLightingMode === 'dark') {
            iframeBody.classList.add(`config-ui-x-dark-mode-${this.theme}`)

            if (!iframeBody.classList.contains('dark-mode')) {
              iframeBody.classList.add('dark-mode')
            }
          } else {
            iframeBody.classList.add(`config-ui-x-${this.theme}`)

            if (iframeBody.classList.contains('dark-mode')) {
              iframeBody.classList.remove('dark-mode')
            }
          }

          // Notify iframe Angular app
          iframe.contentWindow.postMessage(
            { type: 'theme-update', isDark: this.actualLightingMode === 'dark', theme },
            window.location.origin,
          )
        }
      } catch (e) {
        console.warn(`Iframe ${index}: Access denied (cross-origin?)`, { error: e, src: iframe.src })
      }
    })
  }

  public setMenuMode(value: 'default' | 'freeze') {
    this.menuMode = value
  }

  public setLang(lang: string) {
    if (lang) {
      this.$translate.use(lang)
    } else {
      lang = 'auto'
    }
    this.env.lang = lang
  }

  public setItem(key: string, value: any) {
    this[key] = value
  }

  public setEnvItem(key: string, value: any) {
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
  private checkServerTime(timestamp: string) {
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

  private setUiVersion(version: string) {
    if (!this.uiVersion) {
      this.uiVersion = version
    }
  }

  private setTitle(title: string) {
    this.$title.setTitle(title || 'Homebridge')
  }
}
