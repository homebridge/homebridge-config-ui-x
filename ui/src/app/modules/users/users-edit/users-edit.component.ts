import { Component, inject, OnInit, signal } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { USER_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { User } from '@/app/modules/users/users.interface'

@Component({
  templateUrl: './users-edit.component.html',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
  ],
})
export class UsersEditComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(USER_MODAL_DATA)

  // Public properties (from injected data)
  public user = this.modalData.user

  // Signals
  public isCurrentUser = signal(false)

  // Other properties
  private initialFormValue: Partial<User> = {}
  public form = new FormGroup({
    username: new FormControl('', [Validators.required]),
    name: new FormControl('', [Validators.required]),
    password: new FormControl(''),
    passwordConfirm: new FormControl(''),
    admin: new FormControl(true),
  }, this.matchPassword)

  public ngOnInit(): void {
    if (!this.user) {
      return
    }
    this.isCurrentUser.set(this.$auth.user.username === this.user.username)
    this.form.patchValue(this.user)
    this.initialFormValue = this.form.getRawValue()
  }

  public async onSubmit({ value }: { value: Partial<User> }): Promise<void> {
    if (!this.user) {
      return
    }
    try {
      await this.$api.patch(`/users/${this.user.id}`, value)
      this.$activeModal.close()
      this.$toastr.success(this.$translate.instant('users.toast_updated_user'), this.$translate.instant('toast.title_success'))

      if (this.isCurrentUser() && value.username !== this.$auth.user.username) {
        this.$auth.logout()
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.error?.message || this.$translate.instant('users.toast_failed_to_add_user'), this.$translate.instant('toast.title_error'))
    }
  }

  public isFormUnchanged(): boolean {
    if (this.form.controls.password.value) {
      return false
    }
    return JSON.stringify(this.form.getRawValue()) === JSON.stringify(this.initialFormValue)
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  private matchPassword(abstractControl: AbstractControl): { [key: string]: boolean } | null {
    const password = abstractControl.get('password')?.value
    const passwordConfirm = abstractControl.get('passwordConfirm')?.value
    if (password !== passwordConfirm) {
      abstractControl.get('passwordConfirm')?.setErrors({ matchPassword: true })
      return { matchPassword: true }
    }
    return null
  }
}
