import { NgOptimizedImage } from '@angular/common'
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { debounceTime, map, startWith } from 'rxjs/operators'

import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { environment } from '@/environments/environment'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    NgOptimizedImage,
  ],
})
export class LoginComponent implements OnInit {
  private destroyRef = inject(DestroyRef)
  private $auth = inject(AuthService)
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

  public readonly backgroundStyle = signal<string>('')
  public readonly invalidCredentials = signal(false)
  public readonly invalid2faCode = signal(false)
  public readonly twoFactorCodeRequired = signal(false)
  public readonly inProgress = signal(false)

  // Initialize form as property with all controls (including OTP for 2FA)
  // OTP validators are added dynamically when 2FA is required
  public form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    otp: new FormControl('', { nonNullable: true }),
  })

  // Create signal for form validity state
  public readonly formInvalid = toSignal(
    this.form.statusChanges.pipe(
      startWith(this.form.status),
      map(() => this.form.invalid),
    ),
    { initialValue: this.form.invalid },
  )

  public ngOnInit() {
    this.form.valueChanges
      .pipe(
        debounceTime(500),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        const passwordInputValue = this.passwordInput()?.nativeElement.value
        if (passwordInputValue && passwordInputValue !== this.form.controls.password.value) {
          this.form.controls.password.setValue(passwordInputValue)
        }
      })

    this.targetRoute = window.sessionStorage.getItem('target_route') || ''
    void this.setBackground()
  }

  public async onSubmit() {
    this.invalidCredentials.set(false)
    this.invalid2faCode.set(false)
    this.inProgress.set(true)
    document.getElementById('submit-button')?.blur()

    // Grab the values from the native element as they may be "populated" via autofill.
    const passwordInputValue = this.passwordInput()?.nativeElement.value
    if (passwordInputValue && passwordInputValue !== this.form.controls.password.value) {
      this.form.controls.password.setValue(passwordInputValue)
    }

    const usernameInputValue = this.usernameInput()?.nativeElement.value
    if (usernameInputValue && usernameInputValue !== this.form.controls.username.value) {
      this.form.controls.username.setValue(usernameInputValue)
    }

    if (this.twoFactorCodeRequired()) {
      const otpInputValue = this.otpInput()?.nativeElement.value
      if (otpInputValue && otpInputValue !== this.form.controls.otp.value) {
        this.form.controls.otp.setValue(otpInputValue)
      }
    }

    try {
      await this.$auth.login(this.form.getRawValue())

      if (!this.$auth.user.admin && !this.validNonAdminRoutes.includes(this.targetRoute)) {
        this.targetRoute = '/'
      }
      void this.$router.navigateByUrl(this.targetRoute)
      window.sessionStorage.removeItem('target_route')
    } catch (error) {
      if (error.status === 412) {
        // Enable 2FA: add validators to the OTP control
        const otpControl = this.form.controls.otp

        if (!this.twoFactorCodeRequired()) {
          // First time enabling 2FA - set validators
          otpControl.setValidators([
            Validators.required,
            Validators.minLength(6),
            Validators.maxLength(6),
          ])
          otpControl.updateValueAndValidity()
        } else {
          // 2FA already enabled but code was invalid
          otpControl.setErrors({ invalidCode: true })
          this.invalid2faCode.set(true)
        }

        this.twoFactorCodeRequired.set(true)
        setTimeout(() => {
          document.getElementById('form-ota')?.focus()
        }, 100)
      } else {
        this.invalidCredentials.set(true)
      }
    }
    this.inProgress.set(false)
  }

  private async setBackground() {
    if (!this.$settings.settingsLoaded) {
      await firstValueFrom(this.$settings.onSettingsLoaded)
    }

    if (this.$settings.env.customWallpaperHash) {
      const backgroundImageUrl = `${environment.api.base}/auth/wallpaper/${this.$settings.env.customWallpaperHash}`
      this.backgroundStyle.set(`url('${backgroundImageUrl}') center/cover`)
    }
  }
}
