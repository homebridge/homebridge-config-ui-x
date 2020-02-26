import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { WsService } from '../../core/ws.service';
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
  private io = this.$ws.connectToNamespace('app');

  constructor(
    public translate: TranslateService,
    private $ws: WsService,
    public $auth: AuthService,
    private $plugins: ManagePluginsService,
    private $modal: NgbModal,
  ) { }

  ngOnInit() {
    this.io.socket.on('reconnect', () => {
      this.$auth.checkToken();
    });
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
