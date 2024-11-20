import { ApiService } from '@/app/core/api.service'
import { Component, inject } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './users-2fa-disable.component.html',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
  ],
})
export class Users2faDisableComponent {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public formGroup = new FormGroup({
    password: new FormControl('', [Validators.required]),
  })

  public invalidCredentials = false

  disable2fa() {
    this.invalidCredentials = false
    this.$api.post('/users/otp/deactivate', this.formGroup.value).subscribe({
      next: () => {
        this.$activeModal.close()
        this.$toastr.success(this.$translate.instant('users.setup_2fa_disable_success'), this.$translate.instant('toast.title_success'))
      },
      error: () => {
        this.formGroup.setValue({ password: '' })
        this.invalidCredentials = true
      },
    })
  }
}
