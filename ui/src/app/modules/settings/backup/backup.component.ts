import { DatePipe, NgClass } from '@angular/common'
import { Component, inject, OnInit } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbActiveModal, NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'
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
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  private restartToastIsShown = false

  public clicked = false
  public scheduledBackups = []
  public backupTime: string
  public deleting = null
  public currentSettingEnabled = false
  public currentSettingPath = ''
  public enabledFormControl = new FormControl(false)
  public pathFormControl = new FormControl('')

  constructor() {}

  ngOnInit(): void {
    this.getScheduledBackups()
    this.getNextBackup()

    this.currentSettingEnabled = !this.$settings.env.scheduledBackupDisable
    this.currentSettingPath = this.$settings.env.scheduledBackupPath

    this.enabledFormControl.patchValue(this.currentSettingEnabled)
    this.pathFormControl.patchValue(this.currentSettingPath)

    this.enabledFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe(async (value) => {
        this.currentSettingEnabled = value
        await this.saveUiSettingChange('scheduledBackupDisable', !this.currentSettingEnabled)
      })

    this.pathFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe(async (value) => {
        this.currentSettingPath = value
        await this.saveUiSettingChange('scheduledBackupPath', this.currentSettingPath)
      })
  }

  async saveUiSettingChange(key: string, value: any) {
    try {
      await firstValueFrom(this.$api.put('/config-editor/ui', { key, value }))
      this.showRestartToast()
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  getScheduledBackups() {
    this.$api.get('/backup/scheduled-backups').subscribe({
      next: (data) => {
        this.scheduledBackups = data
      },
      error: err => console.error(err),
    })
  }

  getNextBackup() {
    this.$api.get('/backup/scheduled-backups/next').subscribe({
      next: (data) => {
        this.backupTime = data.next
      },
      error: (err) => {
        console.error(err)
      },
    })
  }

  download(backup: { id: any, fileName: string }) {
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

  restore(backup: { id: any, fileName: string } | null) {
    // Close the backup modal and open the restore modal
    this.$activeModal.close()
    const ref = this.$modal.open(RestoreComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.selectedBackup = backup
  }

  delete(backup: { id: any, fileName: string }) {
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

  async onDownloadBackupClick() {
    this.clicked = true
    this.$api.get('/backup/download', { observe: 'response', responseType: 'blob' }).subscribe({
      next: (res) => {
        const archiveName = res.headers.get('File-Name') || 'homebridge-backup.tar.gz'
        this.clicked = false
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
        this.clicked = false
        console.error(error)
        this.$toastr.error(this.$translate.instant('backup.backup_download_failed'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  showRestartToast() {
    if (!this.restartToastIsShown) {
      this.restartToastIsShown = true
      const ref = this.$toastr.info(
        this.$translate.instant('settings.changes.saved'),
        this.$translate.instant('menu.hbrestart.title'),
        {
          timeOut: 0,
          closeButton: false,
          tapToDismiss: true,
          disableTimeOut: true,
          positionClass: 'toast-bottom-right',
          enableHtml: true,
        },
      )

      if (ref && ref.onTap) {
        ref.onTap.subscribe(() => {
          this.$router.navigate(['/restart'])
        })
      }
    }
  }

  protected readonly Date = Date
}
