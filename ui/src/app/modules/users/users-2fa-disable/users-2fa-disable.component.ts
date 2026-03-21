import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap/alert'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { NotificationService } from '@/app/core/communication/notification.service'
import { RequiredIndicatorComponent } from '@/app/core/components/required-indicator/required-indicator.component'

@Component({
  selector: 'app-users-2fa-disable',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    NgbAlert,
    RequiredIndicatorComponent,
  ],
  standalone: true,
  templateUrl: './users-2fa-disable.component.html',
  styleUrl: './users-2fa-disable.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Users2faDisableComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $notification = inject(NotificationService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Signals
  public readonly invalidCredentials = signal(false)

  // Other properties
  public formGroup = new FormGroup({
    password: new FormControl('', [Validators.required]),
  })

  public async disable2fa(): Promise<void> {
    this.invalidCredentials.set(false)
    try {
      await this.$api.post('/users/otp/deactivate', this.formGroup.value)

      this.$activeModal.close()
      this.$toastr.success(this.$translate.instant('users.setup_2fa_disable_success'), this.$translate.instant('toast.title_success'))

      // Clear the legacy OTP notification immediately
      this.$notification.legacyOtpDetected.set(false)

      // Force a token refresh to get updated user data without otpLegacySecret flag
      try {
        await this.$auth.refreshSession()
      } catch (err) {
        // Silently fail - the stale flag will be cleared on next login
        console.error('Failed to refresh session after disabling 2FA:', err)
      }
    } catch {
      this.formGroup.setValue({ password: '' })
      this.invalidCredentials.set(true)
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
