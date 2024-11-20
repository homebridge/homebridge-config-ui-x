import { ApiService } from '@/app/core/api.service'
import { DatePipe } from '@angular/common'
import { Component, inject, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './config.restore.component.html',
  imports: [
    DatePipe,
    TranslatePipe,
  ],
})
export class ConfigRestoreComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public loading = true
  public backupList: {
    id: string
    timestamp: string
    file: string
  }[] = []

  ngOnInit() {
    this.$api.get('/config-editor/backups').subscribe({
      next: (data: any[]) => {
        this.loading = false
        this.backupList = data
      },
      error: (error) => {
        this.loading = false
        console.error(error)
        this.$toastr.error(error.error.message || error.message, this.$translate.instant('toast.title_error'))
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
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.error.message || error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }
}
