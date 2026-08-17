import { LOCALE_ID } from '@angular/core'
import { provideTranslateService, TranslateService } from '@ngx-translate/core'

import { chooseStartupLanguage, localeIdFor } from '@/app/core/locales'

/**
 * Provides translation service and dynamic locale configuration
 */
export function provideAppTranslation() {
  return [
    provideTranslateService({
      fallbackLang: 'en',
      lang: 'en',
    }),
    {
      provide: LOCALE_ID,
      // ⚠️ This deliberately does NOT read `translate.getCurrentLang()`, which is
      // what it used to do. Angular resolves LOCALE_ID exactly once, at bootstrap,
      // right after the app initialisers and before the shell has loaded a single
      // translation — so the current language was always still the 'en' the config
      // above sets, the factory always answered 'en', and every non-English user
      // read a translated UI with English date order and decimal separators.
      //
      // The stored language is the same source the shell uses to pick which
      // translation to load, and it is available synchronously, so the two agree.
      // The cost is that changing language reformats dates and numbers only after
      // the next reload; nothing can re-resolve LOCALE_ID in a running app.
      useFactory: (translate: TranslateService) => localeIdFor(
        chooseStartupLanguage(translate.getBrowserLang(), translate.getBrowserCultureLang()),
      ),
      deps: [TranslateService],
    },
  ]
}
