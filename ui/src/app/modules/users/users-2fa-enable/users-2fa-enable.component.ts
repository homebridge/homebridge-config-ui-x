import { Component, inject, Input, OnInit } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal, NgbAlert } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import dayjs from 'dayjs'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/api.service'
import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { User } from '@/app/modules/users/users.interface'

@Component({
  templateUrl: './users-2fa-enable.component.html',
  standalone: true,
  imports: [
    NgbAlert,
    QrcodeComponent,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
  ],
})
export class Users2faEnableComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() public user: User

  public timeDiffError: number | null = null
  public otpString: string
  public formGroup = new FormGroup({
    code: new FormControl('', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]),
  })

  public ngOnInit(): void {
    this.$api.post('/users/otp/setup', {}).subscribe({
      next: (data) => {
        this.checkTimeDiff(data.timestamp)
        if (!this.timeDiffError) {
          this.otpString = data.otpauth
        }
      },
      error: (error) => {
        this.$activeModal.dismiss()
        console.error(error)
        this.$toastr.error(this.$translate.instant('users.setup_2fa_enable_error'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  public enable2fa() {
    this.$api.post('/users/otp/activate', this.formGroup.value).subscribe({
      next: () => {
        this.$toastr.success(this.$translate.instant('users.setup_2fa_enabled_success'), this.$translate.instant('toast.title_success'))
        this.$activeModal.close()
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(this.$translate.instant('users.setup_2fa_activate_error'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private checkTimeDiff(timestamp: string) {
    const diffMs = dayjs(timestamp).diff(new Date(), 'millisecond')
    if (diffMs < -5000 || diffMs > 5000) {
      this.timeDiffError = diffMs
    } else {
      this.timeDiffError = null
    }
  }
}
