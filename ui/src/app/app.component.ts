import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { AuthService} from './_services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent {
  constructor(
    translate: TranslateService,
    public $auth: AuthService,
  ) {
    // this array needs to be updated each time a new translation is added
    translate.addLangs(['en', 'de', 'fr', 'pl', 'cs', 'ru']);

    if (translate.getLangs().find(x  => x === translate.getBrowserLang())) {
      translate.use(translate.getBrowserLang());
    } else {
      translate.setDefaultLang('en');
    }
  }
}
