import { DatePipe, NgClass } from '@angular/common'
import { Component, DestroyRef, inject, OnInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { NgbActiveModal, NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ApiService } from '@/app/core/api.service'
import { valuesAreEqual } from '@/app/core/helpers/value-comparison.helper'
import { SettingsService } from '@/app/core/settings.service'
import { BackupService } from '@/app/modules/settings/backup/backup.service'
import { RestoreComponent } from '@/app/modules/settings/backup/restore/restore.component'

@Component({
  templateUrl: './backup.component.html',
  standalone: true,
  imports: [
    NgbTooltip,
    NgClass,
    DatePipe,
    TranslatePipe,
    ReactiveFormsModule,
  ],
})
export class BackupComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $backup = inject(BackupService)
  private $destroyRef = inject(DestroyRef)
  private $modal = inject(NgbModal)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  protected readonly Date = Date

  public clicked = false
  public scheduledBackups = []
  public backupTime: string
  public deleting: string | null = null
  public currentSettingEnabled = false
  public currentSettingPath = ''
  public enabledFormControl = new FormControl(false)
  public pathFormControl = new FormControl('')

  // Injected from parent component for coordinated change tracking
  public initialValues: Record<string, any> = {}
  public changedFields: Set<string> = new Set()

  public ngOnInit(): void {
    this.getScheduledBackups()
    this.getNextBackup()

    this.currentSettingEnabled = !this.$settings.env.scheduledBackupDisable
    this.currentSettingPath = this.$settings.env.scheduledBackupPath

    this.enabledFormControl.patchValue(this.currentSettingEnabled)
    this.pathFormControl.patchValue(this.currentSettingPath)

    // Store initial values if not already stored
    if (this.initialValues.scheduledBackupDisable === undefined) {
      this.initialValues.scheduledBackupDisable = this.$settings.env.scheduledBackupDisable
    }
    if (this.initialValues.scheduledBackupPath === undefined) {
      this.initialValues.scheduledBackupPath = this.$settings.env.scheduledBackupPath
    }

    this.enabledFormControl.valueChanges
      .pipe(
        debounceTime(750),
        takeUntilDestroyed(this.$destroyRef),
      )
      .subscribe(async (value) => {
        this.currentSettingEnabled = value
        await this.saveUiSettingChange('scheduledBackupDisable', !this.currentSettingEnabled)
      })

    this.pathFormControl.valueChanges
      .pipe(
        debounceTime(1500),
        takeUntilDestroyed(this.$destroyRef),
      )
      .subscribe(async (value) => {
        this.currentSettingPath = value
        await this.saveUiSettingChange('scheduledBackupPath', this.currentSettingPath)
      })
  }

  public download(backup: { id: any, fileName: string }) {
    this.$api.get(`/backup/scheduled-backups/${backup.id}`, { observe: 'response', responseType: 'blob' }).subscribe({
      next: (res) => {
        const archiveName = backup.fileName || 'homebridge-backup.tar.gz'
        const sizeInBytes = res.body.size
        if (sizeInBytes > globalThis.backup.maxBackupSize) {
          const message = this.$translate.instant('backup.backup_exceeds_max_size', {
            maxBackupSizeText: globalThis.backup.maxBackupSizeText,
            size: `${(sizeInBytes / (1024 * 1024)).toFixed(1)}MB`,
          })
          this.$toastr.warning(message, this.$translate.instant('toast.title_warning'))
        }
        saveAs(res.body, archiveName)
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(this.$translate.instant('backup.backup_download_failed'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  public restore(backup: { id: any, fileName: string } | null) {
    // Close the backup modal and open the restore modal
    this.$activeModal.close()
    const ref = this.$modal.open(RestoreComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.selectedBackup = backup
  }

  public delete(backup: { id: any, fileName: string }) {
    this.deleting = backup.id
    this.$api.delete(`/backup/scheduled-backups/${backup.id}`).subscribe({
      next: () => {
        this.getScheduledBackups()
        this.deleting = null
      },
      error: (error) => {
        this.deleting = null
        console.error(error)
        this.$toastr.error(this.$translate.instant('backup.backup_delete_failed'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  public async onDownloadBackupClick() {
    this.clicked = true
    try {
      await this.$backup.downloadBackup()
      this.clicked = false
    } catch (error) {
      this.clicked = false
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  public async onCreateBackupClick() {
    this.clicked = true
    try {
      await firstValueFrom(this.$api.post('/backup', {}))
      this.clicked = false
      this.getScheduledBackups()
    } catch (error) {
      this.clicked = false
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private async saveUiSettingChange(key: string, value: any) {
    try {
      await firstValueFrom(this.$api.put('/config-editor/ui', { key, value }))

      // Update the environment variable in the settings service
      this.$settings.setEnvItem(key, value)

      // Coordinated change tracking with parent component
      const initialValue = this.initialValues[key]
      const hasChanged = !valuesAreEqual(value, initialValue)

      if (hasChanged) {
        // Field has changed from initial value - add to changed fields set
        this.changedFields.add(key)
      } else {
        // Field has been reverted to initial value - remove from changed fields set
        this.changedFields.delete(key)

        // If no fields are changed anymore, dismiss the toast
        if (this.changedFields.size === 0 && this.$settings.restartToastRef) {
          this.$settings.dismissRestartToast()
          return
        }
      }

      // Show the restart toast if it's not already showing
      if (!this.$settings.restartToastRef) {
        this.$settings.showRestartToast()
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private getScheduledBackups() {
    this.$api.get('/backup/scheduled-backups').subscribe({
      next: (data) => {
        this.scheduledBackups = data
      },
      error: err => console.error(err),
    })
  }

  private getNextBackup() {
    this.$api.get('/backup/scheduled-backups/next').subscribe({
      next: (data) => {
        this.backupTime = data.next
      },
      error: (err) => {
        console.error(err)
      },
    })
  }
}
