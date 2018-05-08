import { Component, OnInit } from '@angular/core';

import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ApiService } from '../_services/api.service';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';
import { createTimelineInstruction } from '@angular/animations/browser/src/dsl/animation_timeline_instruction';

@Component({
  selector: 'app-config.restore-backup',
  templateUrl: './config.restore-backup.component.html'
})
export class ConfigRestoreBackupComponent implements OnInit {
  public backupList: {
    id: string,
    timestamp: string,
    file: string
  }[];

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastsManager,
    private $api: ApiService,
  ) { }

  ngOnInit() {
    this.$api.getConfigBackupList().subscribe(
      (data: any[]) => this.backupList = data,
      (err) => this.toastr.error(err.error.message, 'Failed To Load Backups')
    );
  }

  restore(backupId) {
    return this.activeModal.close(backupId);
  }

  deleteAllBackups() {
    return this.$api.deleteConfigBackups().subscribe(
      (data) => {
        this.activeModal.dismiss();
        this.toastr.success('All Backups Deleted', 'Success!');
      },
      (err) => this.toastr.error(err.error.message, 'Failed To Delete Backups')
    );
  }

}
