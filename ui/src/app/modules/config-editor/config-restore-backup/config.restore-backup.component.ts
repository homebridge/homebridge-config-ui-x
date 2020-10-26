import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '../../../core/api.service';

@Component({
  selector: 'app-config.restore-backup',
  templateUrl: './config.restore-backup.component.html',
})
export class ConfigRestoreBackupComponent implements OnInit {
  public loading = true;
  public backupList: {
    id: string,
    timestamp: string,
    file: string,
  }[] = [];

  constructor(
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    public $toastr: ToastrService,
    private $api: ApiService,
  ) { }

  ngOnInit() {
    this.$api.get('/config-editor/backups').subscribe(
      (data: any[]) => {
        this.loading = false;
        this.backupList = data;
      },
      (err) => {
        this.loading = false;
        this.$toastr.error(err.error.message, this.translate.instant('config.restore.toast_failed_to_load_backups'));
      },
    );
  }

  restore(backupId) {
    return this.activeModal.close(backupId);
  }

  deleteAllBackups() {
    return this.$api.delete('/config-editor/backups').subscribe(
      (data) => {
        this.activeModal.dismiss();
        this.$toastr.success(this.translate.instant('config.restore.toast_backups_deleted'), this.translate.instant('toast.title_success'));
      },
      (err) => this.$toastr.error(err.error.message, this.translate.instant('config.restore.toast_failed_to_delete_backups')),
    );
  }

}
