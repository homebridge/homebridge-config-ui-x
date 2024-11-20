import { ApiService } from '@/app/core/api.service'
import { NgClass } from '@angular/common'
import { Component, inject } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './users-add.component.html',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    NgClass,
    TranslatePipe,
  ],
})
export class UsersAddComponent {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

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
    this.$api.post('/users', value).subscribe({
      next: () => {
        this.$activeModal.close()
        this.$toastr.success(this.$translate.instant('users.toast_added_new_user'), this.$translate.instant('toast.title_success'))
      },
      error: (err) => {
        this.$toastr.error(
          err.error.message || this.$translate.instant('users.toast_failed_to_add_user'),
          this.$translate.instant('toast.title_error'),
        )
      },
    })
  }
}
