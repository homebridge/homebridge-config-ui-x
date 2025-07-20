import { NgClass, NgOptimizedImage, NgStyle } from '@angular/common'
import { AfterViewChecked, ChangeDetectorRef, Component, ElementRef, inject, OnInit, viewChild } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/settings.service'
import { environment } from '@/environments/environment'

@Component({
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [
    NgStyle,
    FormsModule,
    ReactiveFormsModule,
    NgClass,
    TranslatePipe,
    NgOptimizedImage,
  ],
})
export class LoginComponent implements OnInit, AfterViewChecked {
  private $auth = inject(AuthService)
  private $cdr = inject(ChangeDetectorRef)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private targetRoute: string
  private validNonAdminRoutes = [
    '/accessories',
    '/plugins',
    '/logs',
    '/support',
  ]

  readonly passwordInput = viewChild<ElementRef>('password')
  readonly usernameInput = viewChild<ElementRef>('username')
  readonly otpInput = viewChild<ElementRef>('otp')

  public backgroundStyle: string
  public invalidCredentials = false
  public invalid2faCode = false
  public twoFactorCodeRequired = false
  public inProgress = false
  public form: FormGroup<{
    username: FormControl<string>
    password: FormControl<string>
    otp?: FormControl<string>
  }>

  public ngOnInit() {
    this.form = new FormGroup({
      username: new FormControl(''),
      password: new FormControl(''),
    })

    this.form.valueChanges.pipe(debounceTime(500)).subscribe((changes) => {
      const passwordInputValue = this.passwordInput()?.nativeElement.value
      if (passwordInputValue && passwordInputValue !== changes.password) {
        this.form.controls.password.setValue(passwordInputValue)
      }
    })

    this.targetRoute = window.sessionStorage.getItem('target_route') || ''
    this.setBackground()
  }

  public ngAfterViewChecked(): void {
    this.$cdr.detectChanges()
  }

  public async onSubmit() {
    this.invalidCredentials = false
    this.invalid2faCode = false
    this.inProgress = true
    document.getElementById('submit-button')?.blur()

    // Grab the values from the native element as they may be "populated" via autofill.
    const passwordInputValue = this.passwordInput()?.nativeElement.value
    if (passwordInputValue && passwordInputValue !== this.form.get('password').value) {
      this.form.controls.password.setValue(passwordInputValue)
    }

    const usernameInputValue = this.usernameInput()?.nativeElement.value
    if (usernameInputValue && usernameInputValue !== this.form.get('username').value) {
      this.form.controls.username.setValue(usernameInputValue)
    }

    if (this.twoFactorCodeRequired) {
      const otpInputValue = this.otpInput()?.nativeElement.value
      if (otpInputValue && otpInputValue !== this.form.get('otp').value) {
        this.form.controls.username.setValue(otpInputValue)
      }
    }

    try {
      await this.$auth.login(this.form.getRawValue())

      if (!this.$auth.user.admin && !this.validNonAdminRoutes.includes(this.targetRoute)) {
        this.targetRoute = '/'
      }
      this.$router.navigateByUrl(this.targetRoute)
      window.sessionStorage.removeItem('target_route')
    } catch (error) {
      if (error.status === 412) {
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
    }
    this.inProgress = false
  }

  private async setBackground() {
    if (!this.$settings.settingsLoaded) {
      await firstValueFrom(this.$settings.onSettingsLoaded)
    }

    if (this.$settings.env.customWallpaperHash) {
      const backgroundImageUrl = `${environment.api.base}/auth/wallpaper/${this.$settings.env.customWallpaperHash}`
      this.backgroundStyle = `url('${backgroundImageUrl}') center/cover`
    }
  }
}
