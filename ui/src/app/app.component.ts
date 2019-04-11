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
    console.log('Browser Culture Lang:', translate.getBrowserCultureLang());
    console.log('Browser Lang:', translate.getBrowserLang());

    translate.addLangs(['en', 'de', 'fr', 'pl', 'cs', 'ru', 'zh-CN', 'zh-TW', 'hu', 'ja', 'es', 'nl', 'tr']);

    const browserLang = translate.getLangs().find(x => x === translate.getBrowserLang() || x === translate.getBrowserCultureLang());

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
