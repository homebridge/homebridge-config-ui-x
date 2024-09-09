import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/settings.service'
import { environment } from '@/environments/environment'
import { Component, OnInit, ViewChild } from '@angular/core'
import { FormControl, FormGroup, Validators } from '@angular/forms'
import { Router } from '@angular/router'
import { debounceTime } from 'rxjs/operators'

@Component({
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  @ViewChild('password') private passwordInput
  @ViewChild('username') private usernameInput
  @ViewChild('otp') private otpInput

  public form: FormGroup<{
    username: FormControl<string>
    password: FormControl<string>
    otp?: FormControl<string>
  }>

  public backgroundStyle: string
  public invalidCredentials = false
  public invalid2faCode = false
  public twoFactorCodeRequired = false
  public inProgress = false
  private targetRoute

  constructor(
    private $router: Router,
    public $auth: AuthService,
    public $settings: SettingsService,
  ) {}

  ngOnInit() {
    this.form = new FormGroup({
      username: new FormControl(''),
      password: new FormControl(''),
    })

    this.form.valueChanges.pipe(debounceTime(500)).subscribe((changes) => {
      const passwordInputValue = this.passwordInput?.nativeElement.value
      if (passwordInputValue && passwordInputValue !== changes.password) {
        this.form.controls.password.setValue(passwordInputValue)
      }
    })

    this.targetRoute = window.sessionStorage.getItem('target_route') || ''
    this.setBackground()
  }

  async setBackground() {
    if (!this.$settings.settingsLoaded) {
      await this.$settings.onSettingsLoaded.toPromise()
    }

    if (this.$settings.env.customWallpaperHash) {
      const backgroundImageUrl = this.$settings.env.customWallpaperHash
        ? `${environment.api.base}/auth/wallpaper/${this.$settings.env.customWallpaperHash}`
        : '/assets/snapshot.jpg'
      this.backgroundStyle = `url('${backgroundImageUrl}') center/cover`
    }
  }

  async onSubmit() {
    this.invalidCredentials = false
    this.invalid2faCode = false
    this.inProgress = true

    // grab the values from the native element as they may be "populated" via autofill.
    const passwordInputValue = this.passwordInput?.nativeElement.value
    if (passwordInputValue && passwordInputValue !== this.form.get('password').value) {
      this.form.controls.password.setValue(passwordInputValue)
    }

    const usernameInputValue = this.usernameInput?.nativeElement.value
    if (usernameInputValue && usernameInputValue !== this.form.get('username').value) {
      this.form.controls.username.setValue(usernameInputValue)
    }

    if (this.twoFactorCodeRequired) {
      const otpInputValue = this.otpInput?.nativeElement.value
      if (otpInputValue && otpInputValue !== this.form.get('otp').value) {
        this.form.controls.username.setValue(otpInputValue)
      }
    }

    await this.$auth.login(this.form.getRawValue()).then(() => {
      this.$router.navigateByUrl(this.targetRoute)
      window.sessionStorage.removeItem('target_route')
    }).catch((err) => {
      if (err.status === 412) {
        if (!this.form.controls.otp) {
          this.form.addControl('otp', new FormControl('', [
            Validators.required,
            Validators.minLength(6),
            Validators.maxLength(6),
          ]))
        } else {
          this.form.controls.otp.setErrors(['Invalid Code'])
          this.invalid2faCode = true
        }
        this.twoFactorCodeRequired = true
        setTimeout(() => {
          document.getElementById('form-ota').focus()
        }, 100)
      } else {
        this.invalidCredentials = true
      }
    })

    this.inProgress = false
  }
}
