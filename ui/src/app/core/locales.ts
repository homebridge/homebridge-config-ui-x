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
import localeId from '@angular/common/locales/id';
import localeCa from '@angular/common/locales/ca';
import localeKo from '@angular/common/locales/ko';
import localeMk from '@angular/common/locales/mk';
import localeTh from '@angular/common/locales/th';
import localeUk from '@angular/common/locales/uk';
import localeHE from '@angular/common/locales/he';

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
registerLocaleData(localeId);
registerLocaleData(localeCa);
registerLocaleData(localeKo);
registerLocaleData(localeMk);
registerLocaleData(localeTh);
registerLocaleData(localeUk);
registerLocaleData(localeHE);

export const supportedLocales = {
  en: 'en',
  de: 'de',
  fr: 'fr',
  pl: 'pl',
  cs: 'cs',
  ru: 'ru',
  'zh-CN': 'zh-Hans', // Chinese Simplified -> zh-cn -> zh-Hans
  'zh-TW': 'zh-Hant', // Chinese Traditional -> zh-tw -> zh-Hant
  hu: 'hu',
  ja: 'ja',
  es: 'es',
  nl: 'nl',
  tr: 'tr',
  it: 'it',
  bg: 'bg',
  sl: 'sl',
  sv: 'sv',
  no: 'nb', // Norwegian -> no -> nb
  pt: 'pt',
  'pt-BR': 'pt',
  id: 'id',
  ca: 'ca',
  ko: 'ko',
  mk: 'mk',
  th: 'th',
  uk: 'uk',
  he: 'he',
};
