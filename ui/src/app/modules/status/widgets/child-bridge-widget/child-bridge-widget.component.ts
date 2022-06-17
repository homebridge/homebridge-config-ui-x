import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';

import { WsService } from '@/app/core/ws.service';
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service';

@Component({
  selector: 'app-child-bridge-widget',
  templateUrl: './child-bridge-widget.component.html',
  styleUrls: ['./child-bridge-widget.component.scss'],
})
export class ChildBridgeWidgetComponent implements OnInit, OnDestroy {
  @Input() widget;

  private io = this.$ws.connectToNamespace('child-bridges');

  public childBridges = [];

  constructor(
    private $toastr: ToastrService,
    private $translate: TranslateService,
    private $ws: WsService,
    public $plugin: ManagePluginsService,
  ) { }

  ngOnInit(): void {
    this.io.connected.subscribe(async () => {
      this.getChildBridgeMetadata();
      this.io.socket.emit('monitor-child-bridge-status');
    });

    this.io.socket.on('child-bridge-status-update', (data) => {
      const existingBridge = this.childBridges.find(x => x.username === data.username);
      if (existingBridge) {
        Object.assign(existingBridge, data);
      } else {
        this.childBridges.push(data);
      }
    });
  }

  getChildBridgeMetadata() {
    this.io.request('get-homebridge-child-bridge-status').subscribe((data) => {
      this.childBridges = data;
    });
  }

  async restartChildBridge(bridge) {
    bridge.restartInProgress = true;
    try {
      await this.io.request('restart-child-bridge', bridge.username).toPromise();
    } catch (err) {
      this.$toastr.error(
        'Failed to restart bridge: ' + err.error?.message,
        this.$translate.instant('toast.title_error'),
      );
      bridge.restartInProgress = false;
    } finally {

      setTimeout(() => {
        bridge.restartInProgress = false;
      }, 12000);
    }
  }

  ngOnDestroy(): void {
    this.io.end();
  }
}
