import { Component, inject, OnInit } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './scheduled-restart.component.html',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
  ],
})
export class ScheduledRestartComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public enabledFormControl = new FormControl(false)
  public cronFormControl = new FormControl('')
  public timezoneFormControl = new FormControl('')

  public enabled = false
  public cron = ''
  public timezone = ''

  public ngOnInit(): void {
    // Load current settings from env
    const current = (this.$settings.env as any).scheduledRestart || {}
    this.enabled = !!current.enabled
    this.cron = current.cron || ''
    this.timezone = current.timezone || ''

    this.enabledFormControl.patchValue(this.enabled)
    this.cronFormControl.patchValue(this.cron)
    this.timezoneFormControl.patchValue(this.timezone)

    this.enabledFormControl.valueChanges
      .pipe(debounceTime(500))
      .subscribe((value) => {
        this.enabled = !!value
        void this.save()
      })

    this.cronFormControl.valueChanges
      .pipe(debounceTime(1000))
      .subscribe((value) => {
        this.cron = value || ''
        void this.save()
      })

    this.timezoneFormControl.valueChanges
      .pipe(debounceTime(1000))
      .subscribe((value) => {
        this.timezone = value || ''
        void this.save()
      })
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private async save() {
    // Build value object; if disabled, still persist structure for clarity
    const value = {
      enabled: this.enabled,
      cron: this.cron?.trim() || undefined,
      timezone: this.timezone?.trim() || undefined,
    }

    try {
      await firstValueFrom(this.$api.put('/config-editor/ui', { key: 'scheduledRestart', value }))
      // Update env cache
      this.$settings.setEnvItem('scheduledRestart', value)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }
}
