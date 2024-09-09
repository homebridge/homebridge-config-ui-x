import { ApiService } from '@/app/core/api.service'
import { Component } from '@angular/core'
import { FormControl, FormGroup, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './users-2fa-disable.component.html',
})
export class Users2faDisableComponent {
  public formGroup = new FormGroup({
    password: new FormControl('', [Validators.required]),
  })

  public invalidCredentials = false

  constructor(
    public activeModal: NgbActiveModal,
    private toastr: ToastrService,
    private translate: TranslateService,
    private $api: ApiService,
  ) {}

  disable2fa() {
    this.invalidCredentials = false
    this.$api.post('/users/otp/deactivate', this.formGroup.value).subscribe(
      () => {
        this.activeModal.close()
        this.toastr.success(this.translate.instant('users.setup_2fa_disable_success'), this.translate.instant('toast.title_success'))
      },
      () => {
        this.formGroup.setValue({ password: '' })
        this.invalidCredentials = true
      },
    )
  }
}
