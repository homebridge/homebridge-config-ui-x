import { registerLocaleData } from '@angular/common';

import localeEn from '@angular/common/locales/en';
import localeDe from '@angular/common/locales/de';
import localeFr from '@angular/common/locales/fr';
import localePl from '@angular/common/locales/pl';
import localeCs from '@angular/common/locales/cs';
import localeRu from '@angular/common/locales/ru';
import localeZhCn from '@angular/common/locales/zh-Hans';
import localeZhTw from '@angular/common/locales/zh-Hant';
import localeHu from '@angular/common/locales/hu';
import localeJa from '@angular/common/locales/ja';
import localeEs from '@angular/common/locales/es';
import localeNl from '@angular/common/locales/nl';
import localeTr from '@angular/common/locales/tr';
import localeIt from '@angular/common/locales/it';
import localeBg from '@angular/common/locales/bg';
import localeSv from '@angular/common/locales/sv';
import localeNo from '@angular/common/locales/nb';
import localeSl from '@angular/common/locales/sl';
import localePt from '@angular/common/locales/pt';

registerLocaleData(localeEn);
registerLocaleData(localeDe);
registerLocaleData(localeFr);
registerLocaleData(localePl);
registerLocaleData(localeCs);
registerLocaleData(localeRu);
registerLocaleData(localeZhCn);
registerLocaleData(localeZhTw);
registerLocaleData(localeHu);
registerLocaleData(localeJa);
registerLocaleData(localeEs);
registerLocaleData(localeNl);
registerLocaleData(localeTr);
registerLocaleData(localeIt);
registerLocaleData(localeBg);
registerLocaleData(localeSv);
registerLocaleData(localeNo);
registerLocaleData(localeSl);
registerLocaleData(localePt);

export const supportedLocales = {
  'en': 'en',
  'de': 'de',
  'fr': 'fr',
  'pl': 'pl',
  'cs': 'cs',
  'ru': 'ru',
  'zh-CN': 'zh-Hans', // Chinese Simplified -> zh-cn -> zh-Hans
  'zh-TW': 'zh-Hant', // Chinese Traditional -> zh-tw -> zh-Hant
  'hu': 'hu',
  'ja': 'ja',
  'es': 'es',
  'nl': 'nl',
  'tr': 'tr',
  'it': 'it',
  'bg': 'bg',
  'sl': 'sl',
  'sv': 'sv',
  'no': 'nb', // Norwegian -> no -> nb
  'pt': 'pt',
};
