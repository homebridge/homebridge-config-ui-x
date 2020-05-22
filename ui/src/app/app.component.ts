import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { AuthService } from './core/auth/auth.service';
import { Router, NavigationEnd } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent {
  constructor(
    router: Router,
    translate: TranslateService,
    private $auth: AuthService,
  ) {
    // this array needs to be updated each time a new translation is added
    const languages = ['en', 'de', 'fr', 'pl', 'cs', 'ru', 'zh-CN', 'zh-TW', 'hu', 'ja', 'es', 'nl', 'tr', 'it', 'bg', 'sv', 'no', 'sl', 'pt'];

    console.log('Browser Culture Lang:', translate.getBrowserCultureLang());
    console.log('Browser Lang:', translate.getBrowserLang());

    const browserLang = languages.find(x => x === translate.getBrowserLang() || x === translate.getBrowserCultureLang());

    for (const lang of languages) {
      translate.setTranslation(lang, require('../i18n/' + lang + '.json'));
    }

    if (browserLang) {
      translate.use(browserLang);
    } else {
      translate.setDefaultLang('en');
    }

    // ensure the menu closes when we navigate
    router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        const dropdownMenu = window.document.querySelector('#navbarSupportedContent');
        if (dropdownMenu) {
          dropdownMenu.classList.remove('show');
        }
      }
    });
  }
}
