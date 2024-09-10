import { ApiService } from '@/app/core/api.service'
import { Component } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './users-add.component.html',
})
export class UsersAddComponent {
  form = new FormGroup({
    username: new FormControl('', [Validators.required]),
    name: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.compose([Validators.required, Validators.minLength(4)])]),
    passwordConfirm: new FormControl('', [Validators.required]),
    admin: new FormControl(true),
  }, this.matchPassword)

  page = {
    title: 'users.title_add_user',
    save: 'users.button_add_new_user',
    password: 'users.label_password',
  }

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastrService,
    private translate: TranslateService,
    private $api: ApiService,
  ) {}

  matchPassword(AC: AbstractControl) {
    const password = AC.get('password').value
    const passwordConfirm = AC.get('passwordConfirm').value
    if (password !== passwordConfirm) {
      AC.get('passwordConfirm').setErrors({ matchPassword: true })
    } else {
      return null
    }
  }

  onSubmit({ value }) {
    this.$api.post('/users', value).subscribe(
      () => {
        this.activeModal.close()
        this.toastr.success(this.translate.instant('users.toast_added_new_user'), this.translate.instant('toast.title_success'))
      },
      (err) => {
        this.toastr.error(
          err.error.message || this.translate.instant('users.toast_failed_to_add_user'),
          this.translate.instant('toast.title_error'),
        )
      },
    )
  }
}
