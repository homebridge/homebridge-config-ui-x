import type { ITerminalOptions } from '@xterm/xterm'

import { inject, Injectable } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { TranslateService } from '@ngx-translate/core'
import dayjs from 'dayjs'
import { ActiveToast, ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'
import { first, takeUntil } from 'rxjs/operators'

import { ApiService } from '@/app/core/communication/api.service'
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
  private serverTimeToastCleanup$ = new Subject<void>()

  public restartToastRef: ActiveToast<any> | null = null
  public terminalSettingsChanged = new Subject<{ fontSize?: number, fontWeight?: string, lightingMode?: 'light' | 'dark' }>()

  public env: EnvInterface = {} as EnvInterface
  public host!: string
  public proxyHost!: string
  public formAuth = true
  public sessionTimeout = 28800
  public sessionTimeoutInactivityBased = false
  public uiVersion!: string
  public theme!: string
  public lightingMode!: 'auto' | 'light' | 'dark'
  public currentLightingMode!: 'auto' | 'light' | 'dark'
  public actualLightingMode!: 'light' | 'dark'
  public browserLightingMode!: 'light' | 'dark'
  public menuMode!: 'default' | 'freeze'
  public keepOrphans!: boolean
  public wallpaper!: string
  public serverTimeOffset = 0
  public rtl = false // set true if current translation is RLT
  public browserLang!: string // set by the browser language
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
    void this.getAppSettings()
  }

  public async getAppSettings() {
    const data = await this.$api.get('/auth/settings') as AppSettingsInterface
    this.formAuth = data.formAuth
    this.sessionTimeout = data.sessionTimeout
    this.sessionTimeoutInactivityBased = data.sessionTimeoutInactivityBased
    this.env = data.env
    this.host = data.host!
    this.proxyHost = data.proxyHost!
    this.lightingMode = data.lightingMode
    this.wallpaper = data.wallpaper
    this.setLightingMode(this.lightingMode, 'user')
    this.setTheme(data.theme)
    this.setMenuMode(data.menuMode)
    this.setKeepOrphans(data.keepOrphans)
    this.setTitle(this.env.homebridgeInstanceName)
    this.checkServerTime(data.serverTimestamp)
    this.setUiVersion(data.env.packageVersion)
    this.setLang(this.env.lang!)
    this.settingsLoaded = true
    this.settingsLoadedSubject.next(undefined)
    this.browserLang = this.$translate.getBrowserCultureLang()!
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
      this.$api.patch('/config-editor/ui', { theme })
        .catch(error => console.error('Error saving setTheme:', error))
    }

    // Grab the body element
    const bodySelector = window.document.querySelector('body')!

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

          // Notify iframe Angular app
          iframe.contentWindow?.postMessage(
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
    if (this.forbiddenKeys.includes(key)) {
      return
    }
    (this as Record<string, any>)[key] = value
  }

  public setEnvItem(key: string, value: any) {
    // If the key contains a dot, we assume it's a nested property
    if (key.includes('.')) {
      const keys = key.split('.')
      let current: Record<string, any> = this.env
      for (let i = 0; i < keys.length - 1; i += 1) {
        if (this.forbiddenKeys.includes(keys[i])) {
          return
        }
        if (!current[keys[i]]) {
          current[keys[i]] = {}
        }
        current = current[keys[i]]
      }
      if (!this.forbiddenKeys.includes(keys.at(-1)!)) {
        current[keys.at(-1)!] = value
      }
    } else {
      (this.env as Record<string, any>)[key] = value
    }
  }

  /**
   * Check to make sure the server time is roughly the same as the client time.
   * A warning is shown if the time difference is >= 4 hours.
   * @param timestamp
   */
  private checkServerTime(timestamp: string) {
    const serverTime = dayjs(timestamp)
    const diff = serverTime.diff(dayjs(), 'hour')
    this.serverTimeOffset = diff * 60 * 60
    if (diff >= 8 || diff <= -8) {
      // Clean up previous subscription if exists
      this.serverTimeToastCleanup$.next()

      const toast = this.$toastr.warning(
        this.$translate.instant('settings.datetime.incorrect'),
        this.$translate.instant('toast.title_warning'),
        {
          timeOut: 20000,
          tapToDismiss: false,
        },
      )

      toast.onTap
        .pipe(takeUntil(this.serverTimeToastCleanup$))
        .subscribe(() => {
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

  /**
   * Check if a specific feature is enabled based on feature flags
   * @param featureKey - The feature flag key to check
   * @returns true if the feature is enabled, false otherwise
   */
  public isFeatureEnabled(featureKey: string): boolean {
    return this.env.featureFlags?.[featureKey] ?? false
  }

  // Terminal configuration constants
  private readonly TERMINAL_DEFAULTS = {
    FONT_SIZE: 13,
    FONT_WEIGHT: '400' as const,
    LINE_HEIGHT: 1.2,
  } as const

  private readonly TERMINAL_COLORS = {
    DARK: {
      FULL_PAGE: '#000000',
      WIDGET: '#2b2b2b',
    },
    LIGHT: {
      BACKGROUND: '#00000000',
      FOREGROUND: '#2b2b2b',
      CURSOR: '#d2d2d2',
      SELECTION: '#d2d2d2',
    },
  } as const

  /**
   * Get the effective terminal theme with override enforcement
   * CRITICAL: Terminal theme MUST be dark when main lighting mode is dark
   * This prevents light terminals in dark mode regardless of config settings
   * @returns 'dark' or 'light' - always 'dark' if actualLightingMode is 'dark'
   */
  public getEffectiveTerminalLightingMode(): 'dark' | 'light' {
    // HARD OVERRIDE: If user is in dark mode, terminal MUST be dark
    if (this.actualLightingMode === 'dark') {
      return 'dark'
    }

    // Only allow light terminal theme when in light mode
    return this.env.terminal?.lightingMode || 'dark'
  }

  /**
   * Get theme options for terminals
   * @param isWidget - Whether this is for a widget (uses #2b2b2b background in dark mode to match widget box)
   * @returns Object with theme and allowTransparency settings
   */
  public getTerminalThemeOptions(isWidget = false): { theme: any, allowTransparency: boolean } {
    const theme = this.getEffectiveTerminalLightingMode()

    if (theme === 'light') {
      return {
        theme: {
          background: this.TERMINAL_COLORS.LIGHT.BACKGROUND,
          foreground: this.TERMINAL_COLORS.LIGHT.FOREGROUND,
          cursor: this.TERMINAL_COLORS.LIGHT.CURSOR,
          selectionBackground: this.TERMINAL_COLORS.LIGHT.SELECTION,
        },
        allowTransparency: true,
      }
    }

    return {
      theme: {
        background: isWidget
          ? this.TERMINAL_COLORS.DARK.WIDGET
          : this.TERMINAL_COLORS.DARK.FULL_PAGE,
      },
      allowTransparency: false,
    }
  }

  /**
   * Get terminal options with global font settings applied
   * @param overrides - Optional overrides for terminal options
   * @param isWidget - Whether this is for a widget (uses #2b2b2b background in dark mode to match widget box)
   * @returns ITerminalOptions with fontSize and fontWeight from global settings
   */
  public getTerminalOptions(overrides?: Partial<ITerminalOptions>, isWidget = false): ITerminalOptions {
    const themeOptions = this.getTerminalThemeOptions(isWidget)
    return {
      fontSize: this.env.terminal?.fontSize || this.TERMINAL_DEFAULTS.FONT_SIZE,
      fontWeight: this.env.terminal?.fontWeight || this.TERMINAL_DEFAULTS.FONT_WEIGHT,
      lineHeight: this.TERMINAL_DEFAULTS.LINE_HEIGHT,
      allowProposedApi: true,
      theme: themeOptions.theme,
      allowTransparency: themeOptions.allowTransparency,
      screenReaderMode: true,
      ...overrides,
    } as ITerminalOptions
  }
}
