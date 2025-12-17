import { inject, Injectable } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { TranslateService } from '@ngx-translate/core'
import dayjs from 'dayjs'
import { ActiveToast, ToastrService } from 'ngx-toastr'
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

  public restartToastRef: ActiveToast<any> = null

  public env: EnvInterface = {} as EnvInterface
  public host: string
  public proxyHost: string
  public formAuth = true
  public sessionTimeout = 28800
  public sessionTimeoutInactivityBased = false
  public uiVersion: string
  public theme: string
  public lightingMode: 'auto' | 'light' | 'dark'
  public currentLightingMode: 'auto' | 'light' | 'dark'
  public actualLightingMode: 'light' | 'dark'
  public browserLightingMode: 'light' | 'dark'
  public menuMode: 'default' | 'freeze'
  public keepOrphans: boolean
  public wallpaper: string
  public serverTimeOffset = 0
  public rtl = false
  public browserLang: string
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
    this.sessionTimeoutInactivityBased = data.sessionTimeoutInactivityBased
    this.env = data.env
    this.host = data.host
    this.proxyHost = data.proxyHost
    this.lightingMode = data.lightingMode
    this.wallpaper = data.wallpaper
    this.setLightingMode(this.lightingMode, 'user')
    this.setTheme(data.theme)
    this.setMenuMode(data.menuMode)
    this.setKeepOrphans(data.keepOrphans)
    this.setTitle(this.env.homebridgeInstanceName)
    this.checkServerTime(data.serverTimestamp)
    this.setUiVersion(data.env.packageVersion)
    this.setLang(this.env.lang)
    this.settingsLoaded = true
    this.settingsLoadedSubject.next(undefined)
    this.browserLang = this.$translate.getBrowserCultureLang()
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

  private getIframeOrigin(iframe: HTMLIFrameElement): string {
    try {
      const src = iframe.getAttribute('src') || ''
      const url = new URL(src, window.location.href)
      return url.origin
    } catch {
      return ''
    }
  }

  public setTheme(theme: string) {
    if (!theme || !this.themeList.includes(theme)) {
      theme = this.defaultTheme
      firstValueFrom(this.$api.put('/config-editor/ui', { key: 'theme', value: theme }))
        .catch(error => console.error('Error saving setTheme:', error))
    }

    const bodySelector = window.document.querySelector('body')

    bodySelector.classList.remove(`config-ui-x-${this.theme}`)
    bodySelector.classList.remove(`config-ui-x-dark-mode-${this.theme}`)

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

    const iframes = window.document.querySelectorAll('iframe') as NodeListOf<HTMLIFrameElement>
    iframes.forEach((iframe, index) => {
      const iframeOrigin = this.getIframeOrigin(iframe)
      const sameOrigin = !!iframeOrigin && iframeOrigin === window.location.origin

      if (sameOrigin) {
        try {
          const iframeDoc = iframe.contentDocument
          const iframeBody = iframeDoc?.body

          if (iframeBody) {
            if (this.actualLightingMode === 'dark') {
              if (iframeBody.classList.contains(`config-ui-x-${this.theme}`)) {
                iframeBody.classList.remove(`config-ui-x-${this.theme}`)
              }
              if (!iframeBody.classList.contains(`config-ui-x-dark-mode-${this.theme}`)) {
                iframeBody.classList.add(`config-ui-x-dark-mode-${this.theme}`)
              }
              if (!iframeBody.classList.contains('dark-mode')) {
                iframeBody.classList.add('dark-mode')
              }

              iframeBody.style.backgroundColor = '#242424 !important'
              iframeBody.style.color = '#ffffff !important'
            } else {
              if (!iframeBody.classList.contains(`config-ui-x-${this.theme}`)) {
                iframeBody.classList.add(`config-ui-x-${this.theme}`)
              }
              if (iframeBody.classList.contains(`config-ui-x-dark-mode-${this.theme}`)) {
                iframeBody.classList.remove(`config-ui-x-dark-mode-${this.theme}`)
              }
              if (iframeBody.classList.contains('dark-mode')) {
                iframeBody.classList.remove('dark-mode')
              }

              iframeBody.style.backgroundColor = '#ffffff !important'
              iframeBody.style.color = '#000000 !important'
            }
          }
        } catch (e) {
          console.warn(`Iframe ${index}: Same-origin access failed`, { error: e, src: iframe.src })
        }
      }

      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.postMessage(
            { type: 'theme-update', isDark: this.actualLightingMode === 'dark', theme },
            iframeOrigin || '*',
          )
        }
      } catch (e) {
        console.warn(`Iframe ${index}: postMessage failed`, { error: e, src: iframe.src })
      }
    })
  }

  public setMenuMode(value: 'default' | 'freeze') {
    this.menuMode = value
  }

  public setKeepOrphans(value: boolean) {
    this.keepOrphans = value
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
    if (key.includes('.')) {
      const keys = key.split('.')
      let current = this.env
      for (let i = 0; i < keys.length - 1; i += 1) {
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

  public setPageTitle(pageTitle?: string) {
    const baseName = this.env.homebridgeInstanceName || 'Homebridge'
    if (pageTitle) {
      this.$title.setTitle(`${baseName} — ${pageTitle}`)
    } else {
      this.$title.setTitle(baseName)
    }
  }

  public isFeatureEnabled(featureKey: string): boolean {
    return this.env.featureFlags?.[featureKey] ?? false
  }
}
