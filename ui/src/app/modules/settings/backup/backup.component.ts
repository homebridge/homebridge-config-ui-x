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
    public activeModal: NgbActiveModal,
    private $toastr: ToastrService,
    private $translate: TranslateService,
    private $api: ApiService,
  ) {}

  ngOnInit(): void {
    this.getScheduledBackups()
    this.getNextBackup()
  }

  getScheduledBackups() {
    this.$api.get('/backup/scheduled-backups').subscribe(
      (data) => {
        this.scheduledBackups = data
      },
      (err) => {
        this.errorMessage = err.error.message || err.message
      },
    )
  }

  getNextBackup() {
    this.$api.get('/backup/scheduled-backups/next').subscribe(
      (data) => {
        this.backupTime = data.next
      },
      (err) => {
        console.error(err)
      },
    )
  }

  download(backup) {
    this.$api.get(`/backup/scheduled-backups/${backup.id}`, { observe: 'response', responseType: 'blob' }).subscribe(
      (res) => {
        const archiveName = backup.fileName || 'homebridge-backup.tar.gz'
        const sizeInBytes = res.body.size
        if (sizeInBytes > globalThis.backup.maxBackupSize) {
          this.$toastr.warning(`${this.$translate.instant('backup.message_backup_exceeds_max_size')
          } (${globalThis.backup.maxBackupSizeText}) ${(sizeInBytes / (1024 * 1024)).toFixed(1)}MB`)
        }
        saveAs(res.body, archiveName)
      },
      () => {
        this.$toastr.error(this.$translate.instant('backup.message_backup_download_failed'), this.$translate.instant('toast.title_error'))
      },
    )
  }

  async onDownloadBackupClick() {
    this.clicked = true
    this.$api.get('/backup/download', { observe: 'response', responseType: 'blob' }).subscribe(
      (res) => {
        const archiveName = res.headers.get('File-Name') || 'homebridge-backup.tar.gz'
        this.clicked = false
        const sizeInBytes = res.body.size
        if (sizeInBytes > globalThis.backup.maxBackupSize) {
          this.$toastr.warning(`${this.$translate.instant('backup.message_backup_exceeds_max_size')
          } (${globalThis.backup.maxBackupSizeText}) ${(sizeInBytes / (1024 * 1024)).toFixed(1)}MB`)
        }
        saveAs(res.body, archiveName)
      },
      () => {
        this.clicked = false
        this.$toastr.error(this.$translate.instant('backup.message_backup_download_failed'), this.$translate.instant('toast.title_error'))
      },
    )
  }
}
