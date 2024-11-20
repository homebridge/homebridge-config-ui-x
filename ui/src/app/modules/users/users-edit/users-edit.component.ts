import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './users-edit.component.html',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    NgClass,
    TranslatePipe,
  ],
})
export class UsersEditComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() user: any

  public form = new FormGroup({
    username: new FormControl('', [Validators.required]),
    name: new FormControl('', [Validators.required]),
    password: new FormControl(''),
    passwordConfirm: new FormControl(''),
    admin: new FormControl(true),
  }, this.matchPassword)

  public page = {
    title: 'users.title_edit_user',
    save: 'form.button_save',
    password: 'users.label_new_password',
  }

  public isCurrentUser = false

  ngOnInit() {
    this.isCurrentUser = this.$auth.user.username === this.user.username
    this.form.patchValue(this.user)
  }

  matchPassword(abstractControl: AbstractControl) {
    const password = abstractControl.get('password').value
    const passwordConfirm = abstractControl.get('passwordConfirm').value
    if (password !== passwordConfirm) {
      abstractControl.get('passwordConfirm').setErrors({ matchPassword: true })
    } else {
      return null
    }
  }

  onSubmit({ value }) {
    this.$api.patch(`/users/${this.user.id}`, value).subscribe({
      next: () => {
        this.$activeModal.close()
        this.$toastr.success(this.$translate.instant('users.toast_updated_user'), this.$translate.instant('toast.title_success'))

        if (this.isCurrentUser && value.username !== this.$auth.user.username) {
          this.$auth.logout()
        }
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.error.message || this.$translate.instant('users.toast_failed_to_add_user'), this.$translate.instant('toast.title_error'))
      },
    })
  }
}
