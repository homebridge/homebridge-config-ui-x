import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { RequiredIndicatorComponent } from '@/app/core/components/required-indicator/required-indicator.component'
import { USER_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { User } from '@/app/modules/users/users.interface'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-edit.component.html',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    RequiredIndicatorComponent,
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
  public existingUsers: User[] = this.modalData.existingUsers || []

  // Signals
  public isCurrentUser = signal(false)
  public deleteMode = signal(false)

  // Other properties
  private initialFormValue: Partial<User> = {}
  public form = new FormGroup({
    username: new FormControl('', [Validators.required]),
    name: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.minLength(4)]),
    passwordConfirm: new FormControl(''),
    admin: new FormControl(true),
  }, this.matchPassword)

  // Computed signals
  public isLastAdmin = computed(() => {
    // Check if this user is an admin and there are no other admins
    if (!this.user?.admin) {
      return false
    }
    const adminCount = this.existingUsers.filter(u => u.admin).length
    return adminCount <= 1
  })

  public canDelete = computed(() => {
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
      } catch (error) {
        console.error(error)
        this.$toastr.error(error.error?.message || error.message, this.$translate.instant('toast.title_error'))
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
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.error?.message || error.message, this.$translate.instant('toast.title_error'))
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

  private duplicateUsernameValidator(control: FormControl): { [key: string]: boolean } | null {
    if (!control.value) {
      return null
    }

    const trimmedUsername = control.value.trim()
    if (!trimmedUsername) {
      return null
    }

    // Case-sensitive comparison, excluding the current user
    const isDuplicate = this.existingUsers.some(
      user => user.id !== this.user.id && user.username === trimmedUsername,
    )

    return isDuplicate ? { duplicateUsername: true } : null
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
