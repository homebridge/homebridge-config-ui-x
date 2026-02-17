import { DatePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { debounceTime } from 'rxjs/operators'

import { ApiService } from '@/app/core/communication/api.service'
import { RESTORE_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'
import { ScheduledBackup } from '@/app/modules/settings/backup/backup.interfaces'
import { BackupService } from '@/app/modules/settings/backup/backup.service'
import { RestoreComponent } from '@/app/modules/settings/backup/restore/restore.component'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './backup.component.html',
  standalone: true,
  imports: [
    NgbTooltip,
    DatePipe,
    TranslatePipe,
    ReactiveFormsModule,
  ],
})
export class BackupComponent implements OnInit {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $backup = inject(BackupService)
  private $modal = inject(NgbModal)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private injector = inject(EnvironmentInjector)

  // Signals
  public readonly clicked = signal(false)
  public readonly scheduledBackups = signal<ScheduledBackup[]>([])
  public readonly backupTime = signal<string>('')
  public readonly deleting = signal<string | null>(null)
  public readonly currentSettingEnabled = signal(false)
  public readonly currentSettingPath = signal('')

  // Other public properties
  public enabledFormControl = new FormControl(false)
  public pathFormControl = new FormControl('')
  public maxBackupSize = globalThis.backup.maxBackupSize
  public maxBackupSizeText = globalThis.backup.maxBackupSizeText

  // Private properties
  private restartToastIsShown = false

  // Lifecycle hooks
  public ngOnInit(): void {
    void this.getScheduledBackups()
    void this.getNextBackup()

    this.currentSettingEnabled.set(!this.$settings.env.scheduledBackupDisable)
    this.currentSettingPath.set(this.$settings.env.scheduledBackupPath)

    this.enabledFormControl.patchValue(this.currentSettingEnabled())
    this.pathFormControl.patchValue(this.currentSettingPath())

    this.enabledFormControl.valueChanges
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe(async (value) => {
        this.currentSettingEnabled.set(value)
        await this.saveUiSettingChange('scheduledBackupDisable', !this.currentSettingEnabled())
      })

    this.pathFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(async (value) => {
        this.currentSettingPath.set(value)
        await this.saveUiSettingChange('scheduledBackupPath', this.currentSettingPath())
      })
  }

  // Public methods
  public async download(backup: ScheduledBackup): Promise<void> {
    try {
      const res = await this.$api.get(`/backup/scheduled-backups/${backup.id}`, { observe: 'response', responseType: 'blob' })
      const archiveName = backup.fileName || 'homebridge-backup.tar.gz'
      const sizeInBytes = res.body.size
      if (sizeInBytes > this.maxBackupSize) {
        const message = this.$translate.instant('backup.backup_exceeds_max_size', {
          maxBackupSizeText: this.maxBackupSizeText,
          size: `${(sizeInBytes / (1024 * 1024)).toFixed(1)}MB`,
        })
        this.$toastr.warning(message, this.$translate.instant('toast.title_warning'))
      }
      saveAs(res.body, archiveName)
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('backup.backup_download_failed'), this.$translate.instant('toast.title_error'))
    }
  }

  public restore(backup: ScheduledBackup | null): void {
    // Close the backup modal and open the restore modal
    this.$activeModal.close()
    const injector = createEnvironmentInjector([{
      provide: RESTORE_MODAL_DATA,
      useValue: {
        selectedBackup: backup,
      },
    }], this.injector)

    this.$modal.open(RestoreComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
  }

  public async delete(backup: ScheduledBackup): Promise<void> {
    this.deleting.set(backup.id)
    try {
      await this.$api.delete(`/backup/scheduled-backups/${backup.id}`)
      void this.getScheduledBackups()
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('backup.backup_delete_failed'), this.$translate.instant('toast.title_error'))
    } finally {
      this.deleting.set(null)
    }
  }

  public async onDownloadBackupClick(): Promise<void> {
    this.clicked.set(true)
    try {
      await this.$backup.downloadBackup()
      this.clicked.set(false)
    } catch (error) {
      this.clicked.set(false)
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  public async onCreateBackupClick(): Promise<void> {
    this.clicked.set(true)
    try {
      await this.$api.post('/backup', {})
      void this.getScheduledBackups()
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    } finally {
      this.clicked.set(false)
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  // Private methods
  private async saveUiSettingChange(key: string, value: unknown): Promise<void> {
    try {
      await this.$api.put('/config-editor/ui', { key, value })

      // Update the environment variable in the settings service
      this.$settings.setEnvItem(key, value)

      this.showRestartToast()
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private async getScheduledBackups(): Promise<void> {
    try {
      const data = await this.$api.get('/backup/scheduled-backups')
      this.scheduledBackups.set(data)
    } catch (error) {
      console.error(error)
    }
  }

  private async getNextBackup(): Promise<void> {
    try {
      const data = await this.$api.get('/backup/scheduled-backups/next')
      this.backupTime.set(data.next)
    } catch (error) {
      console.error(error)
    }
  }

  private showRestartToast(): void {
    if (!this.restartToastIsShown) {
      this.restartToastIsShown = true
      const ref = this.$toastr.info(
        this.$translate.instant('settings.changes.saved'),
        this.$translate.instant('menu.hbrestart.title'),
        {
          timeOut: 0,
          tapToDismiss: true,
          disableTimeOut: true,
          positionClass: 'toast-bottom-right',
          enableHtml: true,
        },
      )

      if (ref && ref.onTap) {
        ref.onTap
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            void this.$router.navigate(['/restart'])
          })
      }
    }
  }

  // Protected readonly properties
  protected readonly Date = Date
}
