import { registerLocaleData } from '@angular/common'
import localeBg from '@angular/common/locales/bg'
import localeCa from '@angular/common/locales/ca'
import localeCs from '@angular/common/locales/cs'
import localeDe from '@angular/common/locales/de'
import localeEn from '@angular/common/locales/en'
import localeEs from '@angular/common/locales/es'
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
