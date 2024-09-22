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
    public $activeModal: NgbActiveModal,
    private $api: ApiService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  ngOnInit() {
    this.$api.get('/config-editor/backups').subscribe({
      next: (data: any[]) => {
        this.loading = false
        this.backupList = data
      },
      error: (err) => {
        this.loading = false
        this.$toastr.error(err.error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  restore(backupId: any) {
    return this.$activeModal.close(backupId)
  }

  deleteAllBackups() {
    return this.$api.delete('/config-editor/backups').subscribe({
      next: () => {
        this.$activeModal.dismiss()
        this.$toastr.success(this.$translate.instant('config.restore.toast_backups_deleted'), this.$translate.instant('toast.title_success'))
      },
      error: err => this.$toastr.error(err.error.message, this.$translate.instant('toast.title_error')),
    })
  }
}
