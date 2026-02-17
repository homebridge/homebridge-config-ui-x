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
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-add.component.html',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    RequiredIndicatorComponent,
  ],
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
    username: new FormControl('', [Validators.required]),
    name: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.compose([Validators.required, Validators.minLength(4)])]),
    passwordConfirm: new FormControl('', [Validators.required]),
    admin: new FormControl(true),
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
    } catch (error) {
      this.$toastr.error(error.error?.message || error.message, this.$translate.instant('toast.title_error'))
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  private duplicateUsernameValidator(control: FormControl): { [key: string]: boolean } | null {
    if (!control.value) {
      return null
    }

    const trimmedUsername = control.value.trim()
    if (!trimmedUsername) {
      return null
    }

    // Case-sensitive comparison for usernames
    const isDuplicate = this.existingUsers.some(
      user => user.username === trimmedUsername,
    )

    return isDuplicate ? { duplicateUsername: true } : null
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
