import { Component, Input, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service';
import { SettingsService } from '@/app/core/settings.service';
import { WsService } from '@/app/core/ws.service';

@Component({
  selector: 'app-homebridge-status-widget',
  templateUrl: './homebridge-status-widget.component.html',
  styleUrls: ['./homebridge-status-widget.component.scss'],
})
export class HomebridgeStatusWidgetComponent implements OnInit {
  @Input() widget;

  public homebridgePkg = {} as any;
  public homebridgeStatus = {} as any;
  public homebridgePluginStatus = [] as any;

  private io = this.$ws.getExistingNamespace('status');

  constructor(
    private $ws: WsService,
    private $settings: SettingsService,
    public $toastr: ToastrService,
    public $plugin: ManagePluginsService,
  ) {}

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
        this.$settings.env.homebridgeVersion = response.installedVersion;
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
