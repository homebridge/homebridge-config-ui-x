import { Component, inject } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { User } from '@/app/modules/users/users.interface'

@Component({
  templateUrl: './users-add.component.html',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
  ],
})
export class UsersAddComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Other properties
  public form = new FormGroup({
    username: new FormControl('', [Validators.required]),
    name: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.compose([Validators.required, Validators.minLength(4)])]),
    passwordConfirm: new FormControl('', [Validators.required]),
    admin: new FormControl(true),
  }, this.matchPassword)

  public async onSubmit({ value }: { value: Partial<User> }): Promise<void> {
    try {
      await this.$api.post('/users', value)
      this.$activeModal.close()
      this.$toastr.success(this.$translate.instant('users.toast_added_new_user'), this.$translate.instant('toast.title_success'))
    } catch (err) {
      this.$toastr.error(
        err.error.message || this.$translate.instant('users.toast_failed_to_add_user'),
        this.$translate.instant('toast.title_error'),
      )
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  private matchPassword(AC: AbstractControl): { [key: string]: boolean } | null {
    const password = AC.get('password')?.value
    const passwordConfirm = AC.get('passwordConfirm')?.value
    if (password !== passwordConfirm) {
      AC.get('passwordConfirm')?.setErrors({ matchPassword: true })
      return { matchPassword: true }
    }
    return null
  }
}
