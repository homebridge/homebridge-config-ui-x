import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { RequiredIndicatorComponent } from '@/app/core/components/required-indicator/required-indicator.component'
import { ADD_USER_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { User } from '@/app/modules/users/users.interface'

@Component({
  selector: 'app-users-add',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    RequiredIndicatorComponent,
  ],
  standalone: true,
  templateUrl: './users-add.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersAddComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(ADD_USER_MODAL_DATA)

  // Public properties (from injected data)
  public existingUsers: User[] = this.modalData.existingUsers

  // Other properties
  public form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(4)] }),
    passwordConfirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    admin: new FormControl(true, { nonNullable: true }),
  }, this.matchPassword)

  public ngOnInit(): void {
    // Add custom validator for duplicate username
    this.form.controls.username.addValidators(this.duplicateUsernameValidator.bind(this))
    this.form.controls.username.updateValueAndValidity()
  }

  public async onSubmit({ value }: { value: Partial<User> }): Promise<void> {
    try {
      await this.$api.post('/users', value)
      this.$activeModal.close()
    } catch (error: any) {
      this.$toastr.error(error.error?.message || error.message, this.$translate.instant('toast.title_error'))
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  private duplicateUsernameValidator(control: AbstractControl): { [key: string]: boolean } | null {
    if (!control.value) {
      return null
    }

    const trimmedUsername = control.value.trim().toLowerCase()
    if (!trimmedUsername) {
      return null
    }

    // Case-insensitive — matches the backend which collides on lower-cased
    // usernames (auth.service.ts addUser). A case-sensitive check would let
    // "admin" through when "Admin" already exists, and the form would only
    // surface the collision as a 409 toast after submit.
    const isDuplicate = this.existingUsers.some(
      user => user.username?.toLowerCase() === trimmedUsername,
    )

    return isDuplicate ? { duplicateUsername: true } : null
  }

  private matchPassword(AC: AbstractControl): { [key: string]: boolean } | null {
    const passwordConfirmCtrl = AC.get('passwordConfirm')
    const password = AC.get('password')?.value
    const passwordConfirm = passwordConfirmCtrl?.value
    const otherErrors = { ...(passwordConfirmCtrl?.errors ?? {}) }
    delete otherErrors.matchPassword
    if (password !== passwordConfirm) {
      passwordConfirmCtrl?.setErrors({ ...otherErrors, matchPassword: true })
      return { matchPassword: true }
    }
    passwordConfirmCtrl?.setErrors(Object.keys(otherErrors).length ? otherErrors : null)
    return null
  }
}
