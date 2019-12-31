import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { WsService } from '../../../../core/ws.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { ManagePluginsService } from '../../../../core//manage-plugins/manage-plugins.service';

@Component({
  selector: 'app-homebridge-status-widget',
  templateUrl: './homebridge-status-widget.component.html',
  styleUrls: ['./homebridge-status-widget.component.scss'],
})
export class HomebridgeStatusWidgetComponent implements OnInit {
  private io = this.$ws.getExistingNamespace('status');

  public homebridgePkg = {} as any;
  public homebridgeStatus = {} as any;
  public homebridgePluginStatus = [] as any;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
    public $toastr: ToastrService,
    public $plugin: ManagePluginsService,
  ) { }

  async ngOnInit() {
    this.io.socket.on('homebridge-status', (data) => {
      this.homebridgeStatus = data;
    });

    this.io.connected.subscribe(async () => {
      await this.getHomebridgeStatus();
      await this.checkHomebridgeVersion();
      await this.getOutOfDatePlugins();
    });

    if (this.io.socket.connected) {
      await this.getHomebridgeStatus();
      await this.checkHomebridgeVersion();
      await this.getOutOfDatePlugins();
    }

    this.io.socket.on('disconnect', () => {
      this.homebridgeStatus.status = 'down';
    });
  }

  getHomebridgeStatus() {
    return this.io.request('get-homebridge-status').toPromise()
      .then((response) => {
        this.homebridgeStatus = response;
      });
  }

  checkHomebridgeVersion() {
    return this.io.request('homebridge-version-check').toPromise()
      .then((response) => {
        this.homebridgePkg = response;
      })
      .catch((err) => {
        this.$toastr.error(err.message);
      });
  }

  getOutOfDatePlugins() {
    return this.io.request('get-out-of-date-plugins').toPromise()
      .then((response) => {
        this.homebridgePluginStatus = response;
      })
      .catch((err) => {
        this.$toastr.error(err.message);
      });
  }
}
