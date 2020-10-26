import { Component, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { saveAs } from 'file-saver';
import * as dayjs from 'dayjs';

import { ApiService } from '@/app/core/api.service';

@Component({
  selector: 'app-scheduled-backups',
  templateUrl: './scheduled-backups.component.html',
  styleUrls: ['./scheduled-backups.component.scss'],
})
export class ScheduledBackupsComponent implements OnInit {
  public scheduledBackups = [];
  public backupTime = dayjs().set('h', 1).set('minute', 15);
  public errorMessage = '';

  constructor(
    public activeModal: NgbActiveModal,
    private $toastr: ToastrService,
    private $translate: TranslateService,
    private $api: ApiService,
  ) { }

  ngOnInit(): void {
    this.getScheduledBackups();
  }

  getScheduledBackups() {
    this.$api.get('/backup/scheduled-backups').subscribe(
      (data) => {
        this.scheduledBackups = data;
      },
      (err) => {
        this.errorMessage = err.error.message || err.message;
      },
    );
  }

  download(backup) {
    this.$api.get(`/backup/scheduled-backups/${backup.id}`, { observe: 'response', responseType: 'blob' }).subscribe(
      (res) => {
        const archiveName = backup.fileName || 'homebridge-backup.tar.gz';
        saveAs(res.body, archiveName);
      },
      (err) => {
        this.$toastr.error(this.$translate.instant('backup.message_backup_download_failed'), this.$translate.instant('toast.title_error'));
      },
    );
  }

  openBackupRestore() {
    this.activeModal.close();
  }

}
