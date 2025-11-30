import { Component, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { RouterOutlet } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'

import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: true,
  imports: [RouterOutlet],
})
export class AppComponent {
  private $translate = inject(TranslateService)
  private $settings = inject(SettingsService)

  constructor() {
    // Detect if the user has a dark mode preference
    const colorSchemeQueryList = window.matchMedia('(prefers-color-scheme: dark)')
    const setLightingMode = (event: MediaQueryList | MediaQueryListEvent) => {
      this.$settings.setBrowserLightingMode(event.matches ? 'dark' : 'light')
    }
    setLightingMode(colorSchemeQueryList)
    colorSchemeQueryList.addEventListener('change', setLightingMode)

    // This array needs to be updated each time a new translation is added
    const languages = [
      'en',
      'de',
      'fi',
      'fr',
      'pl',
      'cs',
      'ru',
      'zh-CN',
      'zh-TW',
      'hu',
      'ja',
      'es',
      'nl',
      'tr',
      'it',
      'bg',
      'sv',
      'no',
      'sl',
      'pt-BR',
      'pt',
      'id',
      'ca',
      'ko',
      'mk',
      'th',
      'uk',
      'he',
    ]

    // Which languages should use RTL
    const rtlLanguages = [
      'he',
    ]

    // Watch for lang changes
    this.$translate.onLangChange
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.$settings.rtl = rtlLanguages.includes(this.$translate.getCurrentLang())
      })

    const browserLang = languages.find(x => x === this.$translate.getBrowserLang() || x === this.$translate.getBrowserCultureLang())

    // Load all translations asynchronously
    void this.loadTranslations(languages, browserLang)
  }

  private async loadTranslations(languages: string[], browserLang: string | undefined): Promise<void> {
    await Promise.all(
      languages.map(async (lang) => {
        const translation = await import(`../i18n/${lang}.json`)
        this.$translate.setTranslation(lang, translation.default)
      }),
    )

    if (browserLang) {
      this.$translate.use(browserLang)
    } else {
      this.$translate.setFallbackLang('en')
    }
  }
}
