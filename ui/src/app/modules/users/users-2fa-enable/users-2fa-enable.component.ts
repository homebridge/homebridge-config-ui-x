/* global NodeJS */
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap/alert'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import dayjs from 'dayjs'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { USER_MODAL_DATA } from '@/app/core/modal-data-tokens'

@Component({
  selector: 'app-users-2fa-enable',
  imports: [
    NgbAlert,
    QrcodeComponent,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './users-2fa-enable.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Users2faEnableComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(USER_MODAL_DATA)

  // Public properties (from injected data)
  public user = this.modalData.user

  // Signals
  public readonly timeDiffError = signal<number | null>(null)
  public readonly otpString = signal<string | undefined>(undefined)
  public readonly otpSecret = signal<string | undefined>(undefined)
  public readonly secretCopied = signal(false)

  // Other properties
  private copyTimeout: NodeJS.Timeout | null = null
  public formGroup = new FormGroup({
    code: new FormControl('', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]),
  })

  public ngOnInit(): void {
    void this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      const data = await this.$api.post('/users/otp/setup', {})
      this.checkTimeDiff(data.timestamp)
      if (!this.timeDiffError()) {
        this.otpString.set(data.otpauth)
        this.otpSecret.set((new URL(data.otpauth)).searchParams.get('secret') || '')
      }
    } catch (error) {
      this.$activeModal.dismiss()
      console.error(error)
      this.$toastr.error(this.$translate.instant('users.setup_2fa_enable_error'), this.$translate.instant('toast.title_error'))
    }
  }

  public async enable2fa(): Promise<void> {
    try {
      await this.$api.post('/users/otp/activate', this.formGroup.value)
      this.$activeModal.close()
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('users.setup_2fa_activate_error'), this.$translate.instant('toast.title_error'))
    }
  }

  public async copySecretToClipboard(): Promise<void> {
    const secret = this.otpSecret()
    if (!secret) {
      return
    }
    await navigator.clipboard.writeText(secret)
    this.secretCopied.set(true)

    if (this.copyTimeout) {
      clearTimeout(this.copyTimeout)
    }

    this.copyTimeout = setTimeout(() => {
      this.secretCopied.set(false)
    }, 3000)
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  private checkTimeDiff(timestamp: string): void {
    const diffMs = dayjs(timestamp).diff(new Date(), 'millisecond')
    if (diffMs < -5000 || diffMs > 5000) {
      this.timeDiffError.set(diffMs)
    } else {
      this.timeDiffError.set(null)
    }
  }
}
