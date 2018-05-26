import { Component } from '@angular/core';
import { AuthService} from './_services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent {
  constructor(
    public $auth: AuthService,
  ) {
  }
}
