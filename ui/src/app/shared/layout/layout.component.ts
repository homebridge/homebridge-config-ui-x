import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { WsService } from '@/app/core/ws.service';
import { AuthService } from '@/app/core/auth/auth.service';
import { BackupRestoreComponent } from '@/app/core/backup-restore/backup-restore.component';
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service';
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component';

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
    private $router: Router,
  ) { }

  ngOnInit() {
    this.io.socket.on('reconnect', () => {
      this.$auth.checkToken();
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

  restartServer() {
    const ref = this.$modal.open(ConfirmComponent);
    ref.componentInstance.title = this.translate.instant('menu.linux.label_restart_server');
    ref.componentInstance.message = this.translate.instant('platform.linux.restart.confirmation');
    ref.componentInstance.confirmButtonLabel = this.translate.instant('menu.linux.label_restart_server');

    ref.result
      .then(() => {
        this.$router.navigate(['/platform-tools/linux/restart-server']);
      })
      .finally(() => {
        // do nothing
      });
  }

  shutdownServer() {
    const ref = this.$modal.open(ConfirmComponent);
    ref.componentInstance.title = this.translate.instant('menu.linux.label_shutdown_server');
    ref.componentInstance.message = this.translate.instant('platform.linux.shutdown.confirmation');
    ref.componentInstance.confirmButtonLabel = this.translate.instant('menu.linux.label_shutdown_server');

    ref.result
      .then(() => {
        this.$router.navigate(['/platform-tools/linux/shutdown-server']);
      })
      .finally(() => {
        // do nothing
      });
  }

}
