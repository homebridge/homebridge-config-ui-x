import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, Validators, FormControl } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../auth.service';
import { environment } from '@/environments/environment';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  public form: FormGroup;
  public backgroundStyle: string;
  public invalidCredentials = false;
  public invalid2faCode = false;
  public twoFactorCodeRequired = false;
  public inProgress = false;
  private targetRoute;

  constructor(
    private $router: Router,
    public $auth: AuthService,
  ) { }

  ngOnInit() {
    this.form = new FormGroup({
      username: new FormControl('', [Validators.required]),
      password: new FormControl('', [Validators.required]),
    });

    this.targetRoute = window.sessionStorage.getItem('target_route') || '';
    this.setBackground();
  }

  async setBackground() {
    if (!this.$auth.settingsLoaded) {
      await this.$auth.onSettingsLoaded.toPromise();
    }

    const backgroundImageUrl = this.$auth.env.customWallpaperHash ?
      environment.api.base + '/auth/wallpaper/' + this.$auth.env.customWallpaperHash :
      '/assets/snapshot.jpg';
    this.backgroundStyle = `url('${backgroundImageUrl}') no-repeat center center fixed`;
  }

  async onSubmit({ value, valid }) {
    this.invalidCredentials = false;
    this.invalid2faCode = false;
    this.inProgress = true;
    await this.$auth.login(this.form.value)
      .then((user) => {
        this.$router.navigateByUrl(this.targetRoute);
        window.sessionStorage.removeItem('target_route');
      })
      .catch((err) => {
        if (err.status === 412) {
          if (!this.form.controls['otp']) {
            this.form.addControl('otp', new FormControl('', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]));
          } else {
            this.form.controls['otp'].setErrors(['Invalid Code']);
            this.invalid2faCode = true;
          }
          this.twoFactorCodeRequired = true;
          setTimeout(() => {
            document.getElementById('form-ota').focus();
          }, 100);
        } else {
          this.invalidCredentials = true;
        }
      });

    this.inProgress = false;
  }

}
