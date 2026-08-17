import { registerLocaleData } from '@angular/common'
import localeBg from '@angular/common/locales/bg'
import localeCa from '@angular/common/locales/ca'
import localeCs from '@angular/common/locales/cs'
import localeDe from '@angular/common/locales/de'
import localeEn from '@angular/common/locales/en'
import localeEs from '@angular/common/locales/es'
import localeFi from '@angular/common/locales/fi'
import localeFr from '@angular/common/locales/fr'
import localeHE from '@angular/common/locales/he'
import localeHu from '@angular/common/locales/hu'
import localeId from '@angular/common/locales/id'
import localeIt from '@angular/common/locales/it'
import localeJa from '@angular/common/locales/ja'
import localeKo from '@angular/common/locales/ko'
import localeMk from '@angular/common/locales/mk'
import localeNo from '@angular/common/locales/nb'
import localeNl from '@angular/common/locales/nl'
import localePl from '@angular/common/locales/pl'
import localePt from '@angular/common/locales/pt'
import localeRu from '@angular/common/locales/ru'
import localeSl from '@angular/common/locales/sl'
import localeSv from '@angular/common/locales/sv'
import localeTh from '@angular/common/locales/th'
import localeTr from '@angular/common/locales/tr'
import localeUk from '@angular/common/locales/uk'
import localeVi from '@angular/common/locales/vi'
import localeZhCn from '@angular/common/locales/zh-Hans'
import localeZhTw from '@angular/common/locales/zh-Hant'

registerLocaleData(localeEn)
registerLocaleData(localeBg)
registerLocaleData(localeCa)
registerLocaleData(localeZhCn)
registerLocaleData(localeZhTw)
registerLocaleData(localeCs)
registerLocaleData(localeFi)
registerLocaleData(localeFr)
registerLocaleData(localeDe)
registerLocaleData(localeHu)
registerLocaleData(localeId)
registerLocaleData(localeHE)
registerLocaleData(localeIt)
registerLocaleData(localeJa)
registerLocaleData(localeKo)
registerLocaleData(localeMk)
registerLocaleData(localeNl)
registerLocaleData(localeNo)
registerLocaleData(localePl)
registerLocaleData(localePt)
registerLocaleData(localeRu)
registerLocaleData(localeSl)
registerLocaleData(localeEs)
registerLocaleData(localeSv)
registerLocaleData(localeTh)
registerLocaleData(localeTr)
registerLocaleData(localeUk)
registerLocaleData(localeVi)

export const supportedLocales = {
  'en': 'en',
  'bg': 'bg',
  'ca': 'ca',
  'zh-CN': 'zh-Hans', // Chinese Simplified -> zh-cn -> zh-Hans
  'zh-TW': 'zh-Hant', // Chinese Traditional -> zh-tw -> zh-Hant
  'cs': 'cs',
  'fi': 'fi',
  'fr': 'fr',
  'de': 'de',
  'hu': 'hu',
  'id': 'id',
  'he': 'he',
  'it': 'it',
  'ja': 'ja',
  'ko': 'ko',
  'mk': 'mk',
  'nl': 'nl',
  'no': 'nb', // Norwegian -> no -> nb
  'pl': 'pl',
  'pt': 'pt',
  'pt-BR': 'pt',
  'ru': 'ru',
  'sl': 'sl',
  'es': 'es',
  'sv': 'sv',
  'th': 'th',
  'tr': 'tr',
  'uk': 'uk',
  'vi': 'vi',
}

/** Where the chosen language is kept between visits. */
const LANG_STORAGE_KEY = 'uix.lang'

/**
 * The language the user last chose, if any.
 *
 * Written by SettingsService whenever the language changes, which means it also
 * mirrors the `lang` in config.json after the first load. It is read straight
 * from storage rather than from the server settings because both callers need an
 * answer at bootstrap, before any API call has returned.
 */
export function storedLanguage(): string | undefined {
  try {
    // Some private-browsing modes block storage access entirely
    return window.localStorage.getItem(LANG_STORAGE_KEY) || undefined
  } catch {
    return undefined
  }
}

/**
 * The language the UI should start in: the one the user chose, else whichever
 * shipped language matches the browser, else none.
 *
 * Shared by the two places that need to make this decision — the shell, which
 * loads that translation, and the LOCALE_ID factory, which formats dates and
 * numbers for it. They used to decide separately, and disagreeing would mean a
 * German UI with French number formats.
 * @param browserLang - the browser language, e.g. `de`
 * @param browserCultureLang - the fuller form, e.g. `pt-BR`
 */
export function chooseStartupLanguage(browserLang?: string | null, browserCultureLang?: string | null): string | undefined {
  const languages = Object.keys(supportedLocales)
  const stored = storedLanguage()

  // 'auto' is an explicit "follow the browser", and a stored language the app no
  // longer ships (removed in an update) has to be treated as no choice at all
  if (stored && stored !== 'auto' && languages.includes(stored)) {
    return stored
  }

  return languages.find(lang => lang === browserLang || lang === browserCultureLang)
}

/**
 * The Angular locale to format dates and numbers with for a language.
 * @param lang - a UI language, or nothing if none was settled on
 */
export function localeIdFor(lang?: string): string {
  return lang && lang in supportedLocales
    ? supportedLocales[lang as keyof typeof supportedLocales]
    : 'en'
}
