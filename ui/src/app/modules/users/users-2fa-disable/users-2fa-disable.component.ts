import { Component, inject, signal } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap/alert'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'

@Component({
  templateUrl: './users-2fa-disable.component.html',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    NgbAlert,
  ],
})
export class Users2faDisableComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Signals
  public invalidCredentials = signal(false)

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
    } catch {
      this.formGroup.setValue({ password: '' })
      this.invalidCredentials.set(true)
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
