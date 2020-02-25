import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { AuthService } from '../../core/auth/auth.service';
import { ResetHomebridgeModalComponent } from '../../core/reset-homebridge-modal/reset-homebridge-modal.component';
import { BackupRestoreComponent } from '../../core/backup-restore/backup-restore.component';
import { ManagePluginsService } from '../../core/manage-plugins/manage-plugins.service';

@Component({
  selector: 'app-layout',
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss'],
})
export class LayoutComponent implements OnInit {

  constructor(
    public translate: TranslateService,
    public $auth: AuthService,
    private $plugins: ManagePluginsService,
    private $modal: NgbModal,
  ) { }

  ngOnInit() {
  }

  resetHomebridgeState() {
    this.$modal.open(ResetHomebridgeModalComponent, {
      size: 'lg',
    });
  }

  backupRestoreHomebridge() {
    this.$modal.open(BackupRestoreComponent, {
      size: 'lg',
      backdrop: 'static',
    });
  }

  openUiSettings() {
    this.$plugins.settings('homebridge-config-ui-x');
  }

}
