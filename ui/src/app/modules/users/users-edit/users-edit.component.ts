import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { RequiredIndicatorComponent } from '@/app/core/components/required-indicator/required-indicator.component'
import { USER_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { User } from '@/app/modules/users/users.interface'

@Component({
  selector: 'app-users-edit',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    RequiredIndicatorComponent,
  ],
  standalone: true,
  templateUrl: './users-edit.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersEditComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $errors = inject(HttpErrorService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(USER_MODAL_DATA)

  // Public properties (from injected data)
  public user = this.modalData.user
  public existingUsers: User[] = this.modalData.existingUsers || []

  // Signals
  public readonly isCurrentUser = signal(false)
  public readonly deleteMode = signal(false)

  // Other properties
  private initialFormValue: Record<string, any> = {}
  public form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.minLength(4)] }),
    passwordConfirm: new FormControl('', { nonNullable: true }),
    admin: new FormControl(true, { nonNullable: true }),
  }, this.matchPassword)

  // Computed signals
  public readonly isLastAdmin = computed(() => {
    // Check if this user is an admin and there are no other admins
    if (!this.user?.admin) {
      return false
    }
    const adminCount = this.existingUsers.filter(u => u.admin).length
    return adminCount <= 1
  })

  public readonly canDelete = computed(() => {
    // Cannot delete if it's the current user or the last admin
    return !this.isCurrentUser() && !this.isLastAdmin()
  })

  public ngOnInit(): void {
    if (!this.user) {
      return
    }
    this.isCurrentUser.set(this.$auth.user.username === this.user.username)
    this.form.patchValue(this.user)
    this.initialFormValue = this.form.getRawValue()

    // Add custom validator for duplicate username
    this.form.controls.username.addValidators(this.duplicateUsernameValidator.bind(this))
    this.form.controls.username.updateValueAndValidity()

    // Disable admin checkbox if this is the last admin (can't demote the last admin)
    if (this.isLastAdmin()) {
      this.form.controls.admin.disable()
    }
  }

  public async onSubmit({ value }: { value: Partial<User> }): Promise<void> {
    if (!this.user) {
      return
    }

    // Handle deletion
    if (this.deleteMode()) {
      try {
        await this.$api.delete(`/users/${this.user.id}`)
        this.$activeModal.close()
      } catch (error: any) {
        console.error(error)
        this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      }
      return
    }

    // Handle update
    try {
      await this.$api.patch(`/users/${this.user.id}`, value)
      this.$activeModal.close()
      if (this.isCurrentUser() && value.username !== this.$auth.user.username) {
        this.$auth.logout()
      }
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    }
  }

  public toggleDeleteMode(event: MouseEvent): void {
    this.deleteMode.set(!this.deleteMode())

    if (this.deleteMode()) {
      // Disable the form
      this.form.disable()
    } else {
      // Re-enable the form
      this.form.enable()
      // Re-disable the admin checkbox if this is the last admin
      if (this.isLastAdmin()) {
        this.form.controls.admin.disable()
      }
    }

    // Remove focus from the button
    ;(event.target as HTMLElement).blur()
  }

  public isFormUnchanged(): boolean {
    if (this.form.controls.password.value) {
      return false
    }
    return JSON.stringify(this.form.getRawValue()) === JSON.stringify(this.initialFormValue)
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
    // usernames (auth.service.ts updateUser).
    const isDuplicate = this.existingUsers.some(
      user => user.id !== this.user.id && user.username?.toLowerCase() === trimmedUsername,
    )

    return isDuplicate ? { duplicateUsername: true } : null
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  private matchPassword(abstractControl: AbstractControl): { [key: string]: boolean } | null {
    const passwordConfirmCtrl = abstractControl.get('passwordConfirm')
    const password = abstractControl.get('password')?.value
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
