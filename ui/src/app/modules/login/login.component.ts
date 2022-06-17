import { Component, OnInit, ViewChild } from '@angular/core';
import { FormGroup, Validators, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime } from 'rxjs/operators';

import { environment } from '@/environments/environment';
import { SettingsService } from '@/app/core/settings.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  @ViewChild('password') private passwordInput;

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
    public $settings: SettingsService,
  ) { }

  ngOnInit() {
    this.form = new FormGroup({
      username: new FormControl('', [Validators.required]),
      password: new FormControl('', [Validators.required]),
    });

    this.form.valueChanges
      .pipe(debounceTime(500))
      .subscribe((changes) => {
        const passwordInputValue = this.passwordInput.nativeElement.value;
        if (passwordInputValue !== changes.password) {
          this.form.controls.password.setValue(passwordInputValue);
        }
      });

    this.targetRoute = window.sessionStorage.getItem('target_route') || '';
    this.setBackground();
  }

  async setBackground() {
    if (!this.$settings.settingsLoaded) {
      await this.$settings.onSettingsLoaded.toPromise();
    }

    if (this.$settings.env.customWallpaperHash) {
      const backgroundImageUrl = this.$settings.env.customWallpaperHash ?
        environment.api.base + '/auth/wallpaper/' + this.$settings.env.customWallpaperHash :
        '/assets/snapshot.jpg';
      this.backgroundStyle = `url('${backgroundImageUrl}') center/cover`;
    }
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
