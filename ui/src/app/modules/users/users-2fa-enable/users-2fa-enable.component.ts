import { ApiService } from '@/app/core/api.service'
import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core'
import { FormControl, FormGroup, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import * as dayjs from 'dayjs'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './users-2fa-enable.component.html',
})
export class Users2faEnableComponent implements OnInit {
  @Input() public user

  @ViewChild('qrcode', { static: true }) qrcodeElement: ElementRef

  public timeDiffError: number | null = null
  public otpString: string

  public formGroup = new FormGroup({
    code: new FormControl('', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]),
  })

  constructor(
    public activeModal: NgbActiveModal,
    private toastr: ToastrService,
    private translate: TranslateService,
    private $api: ApiService,
  ) {}

  ngOnInit(): void {
    this.$api.post('/users/otp/setup', {}).subscribe(
      (data) => {
        this.checkTimeDiff(data.timestamp)
        if (!this.timeDiffError) {
          this.otpString = data.otpauth
        }
      },
      (err) => {
        this.activeModal.dismiss()
        this.toastr.error(
          err.error.message || 'An error occurred while attempting to setup 2FA',
          this.translate.instant('toast.title_error'),
        )
      },
    )
  }

  checkTimeDiff(timestamp: string) {
    const diffMs = dayjs(timestamp).diff(new Date(), 'millisecond')
    if (diffMs < -5000 || diffMs > 5000) {
      this.timeDiffError = diffMs
      return
    }
    this.timeDiffError = null
  }

  enable2fa() {
    this.$api.post('/users/otp/activate', this.formGroup.value).subscribe(
      () => {
        this.toastr.success(this.translate.instant('users.setup_2fa_enabled_success'), this.translate.instant('toast.title_success'))
        this.activeModal.close()
      },
      (err) => {
        this.toastr.error(err.error.message || 'An error occurred', this.translate.instant('toast.title_error'))
      },
    )
  }
}
