import { Component, OnInit, OnDestroy } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { GridsterConfig, GridsterItem } from 'angular-gridster2';
import { Subject } from 'rxjs';

import { WsService } from '../../core/ws.service';
import { AuthService } from '../../core/auth/auth.service';
import { ManagePluginsService } from '../../core/manage-plugins/manage-plugins.service';
import { WidgetControlComponent } from './widget-control/widget-control.component';

@Component({
  selector: 'app-status',
  templateUrl: './status.component.html',
  styleUrls: [
    './status.component.scss',
  ],
})
export class StatusComponent implements OnInit, OnDestroy {
  private io = this.$ws.connectToNamespace('status');

  public options: GridsterConfig;
  public dashboard: Array<GridsterItem> = [];
  public consoleStatus: 'up' | 'down' = 'down';

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
    public $plugin: ManagePluginsService,
    public $toastr: ToastrService,
    private $modal: NgbModal,
  ) { }

  ngOnInit() {
    this.options = {
      itemChangeCallback: this.gridChangedEvent.bind(this),
      itemResizeCallback: this.gridResizeEvent,
      draggable: {
        enabled: this.$auth.user.admin,
      },
      resizable: {
        enabled: this.$auth.user.admin,
      },
      gridType: 'verticalFixed',
      minCols: 20,
      maxCols: 20,
      minRows: 20,
      maxRows: 40,
      fixedColWidth: 36,
      fixedRowHeight: 36,
      disableScrollHorizontal: true,
      disableScrollVertical: false,
      pushItems: true,
      displayGrid: 'none',
    };

    this.io.connected.subscribe(async () => {
      this.consoleStatus = 'up';
      this.io.socket.emit('monitor-server-status');

      // get the dashboard layout
      if (!this.dashboard.length) {
        this.io.request('get-dashboard-layout').subscribe((layout) => {
          if (!layout.length) {
            layout = require('./default-dashboard-layout.json');
          }
          this.dashboard = layout.map((item) => {
            item.$resizeEvent = new Subject();
            return item;
          });
        });
      }
    });

    this.io.socket.on('disconnect', () => {
      this.consoleStatus = 'down';
    });

    this.io.socket.on('homebridge-status', (data) => {
      // check if client is up-to-date
      if (data.packageVersion && data.packageVersion !== this.$auth.uiVersion) {
        // tslint:disable-next-line:deprecation
        window.location.reload(true);
      }
    });
  }

  gridResizeEvent(item, itemComponent) {
    itemComponent.item.$resizeEvent.next('resize');
  }

  async gridChangedEvent() {
    const layout = this.dashboard.map((item) => {
      const resp = {};
      for (const key of Object.keys(item)) {
        if (!key.startsWith('$')) {
          resp[key] = item[key];
        }
      }
      return resp;
    });

    try {
      await this.io.request('set-dashboard-layout', layout).toPromise();
    } catch (e) {
      console.error('Failed to save dashboard layout');
      console.error(e);
    }
  }

  ngOnDestroy() {
    this.io.end();
  }

  addWidget() {
    this.dashboard.push({
      'cols': 6,
      'rows': 6,
      'y': undefined,
      'x': undefined,
      'component': 'SystemInfoWidgetComponent',
      $resizeEvent: new Subject(),
    });
  }

  manageWidget(item) {
    const ref = this.$modal.open(WidgetControlComponent);
    ref.componentInstance.widget = item;

    ref.result
      .then((action) => {
        if (action === 'remove') {
          const index = this.dashboard.findIndex(x => x === item);
          this.dashboard.splice(index, 1);
          this.gridChangedEvent();
        }
      })
      .catch(() => {

      });
  }

}
