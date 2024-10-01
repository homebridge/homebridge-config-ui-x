import { SettingsService } from '@/app/core/settings.service'
import { Component } from '@angular/core'
import { Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent {
  constructor(
    private $router: Router,
    private $translate: TranslateService,
    private $settings: SettingsService,
  ) {
    // Detect if the user has a dark mode preference
    const colorSchemeQueryList = window.matchMedia('(prefers-color-scheme: dark)')
    const setLightingMode = (event: MediaQueryList | MediaQueryListEvent) => {
      $settings.setBrowserLightingMode(event.matches ? 'dark' : 'light')
    }
    setLightingMode(colorSchemeQueryList)
    colorSchemeQueryList.addEventListener('change', setLightingMode)

    // this array needs to be updated each time a new translation is added
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

    // which languages should use RTL
    const rtlLanguages = [
      'he',
    ]

    // watch for lang changes
    $translate.onLangChange.subscribe(() => {
      $settings.rtl = rtlLanguages.includes($translate.currentLang)
    })

    const browserLang = languages.find(x => x === $translate.getBrowserLang() || x === $translate.getBrowserCultureLang())

    for (const lang of languages) {
      // eslint-disable-next-line ts/no-require-imports
      $translate.setTranslation(lang, require(`../i18n/${lang}.json`))
    }

    if (browserLang) {
      $translate.use(browserLang)
    } else {
      $translate.setDefaultLang('en')
    }
  }
}
