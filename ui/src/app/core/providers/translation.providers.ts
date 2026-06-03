import { LOCALE_ID } from '@angular/core'
import { provideTranslateService, TranslateService } from '@ngx-translate/core'

import { supportedLocales } from '@/app/core/locales'

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
      useFactory: (translate: TranslateService) => {
        const currentLang = translate.getCurrentLang()
        if (currentLang && currentLang in supportedLocales) {
          return supportedLocales[currentLang as keyof typeof supportedLocales]
        } else {
          return 'en'
        }
      },
      deps: [TranslateService],
    },
  ]
}
