import { ApiService } from '@/app/core/api.service'
import { Component, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './config.restore.component.html',
})
export class ConfigRestoreComponent implements OnInit {
  public loading = true
  public backupList: {
    id: string
    timestamp: string
    file: string
  }[] = []

  constructor(
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    public $toastr: ToastrService,
    private $api: ApiService,
  ) {}

  ngOnInit() {
    this.$api.get('/config-editor/backups').subscribe(
      (data: any[]) => {
        this.loading = false
        this.backupList = data
      },
      (err) => {
        this.loading = false
        this.$toastr.error(err.error.message, this.translate.instant('config.restore.toast_failed_to_load_backups'))
      },
    )
  }

  restore(backupId) {
    return this.activeModal.close(backupId)
  }

  deleteAllBackups() {
    return this.$api.delete('/config-editor/backups').subscribe(
      () => {
        this.activeModal.dismiss()
        this.$toastr.success(this.translate.instant('config.restore.toast_backups_deleted'), this.translate.instant('toast.title_success'))
      },
      err => this.$toastr.error(err.error.message, this.translate.instant('config.restore.toast_failed_to_delete_backups')),
    )
  }
}
