import { ApiService } from '@/app/core/api.service'
import { Component, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './backup.component.html',
})
export class BackupComponent implements OnInit {
  public clicked = false
  public scheduledBackups = []
  public backupTime: string
  public errorMessage = ''

  constructor(
    public $activeModal: NgbActiveModal,
    private $api: ApiService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.getScheduledBackups()
    this.getNextBackup()
  }

  getScheduledBackups() {
    this.$api.get('/backup/scheduled-backups').subscribe({
      next: (data) => {
        this.scheduledBackups = data
      },
      error: (err) => {
        this.errorMessage = err.error.message || err.message
      },
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
}
