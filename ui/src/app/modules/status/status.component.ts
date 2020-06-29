import { Component, OnInit, OnDestroy } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { GridsterConfig, GridsterItem } from 'angular-gridster2';
import { Subject, TimeoutError } from 'rxjs';
import { take } from 'rxjs/operators';

import { WsService } from '../../core/ws.service';
import { AuthService } from '../../core/auth/auth.service';
import { MobileDetectService } from '../../core/mobile-detect.service';
import { ManagePluginsService } from '../../core/manage-plugins/manage-plugins.service';
import { WidgetControlComponent } from './widget-control/widget-control.component';
import { WidgetAddComponent } from './widget-add/widget-add.component';

@Component({
  selector: 'app-status',
  templateUrl: './status.component.html',
  styleUrls: [
    './status.component.scss',
  ],
})
export class StatusComponent implements OnInit, OnDestroy {
  private io = this.$ws.connectToNamespace('status');

  public saveWidgetsEvent = new Subject();
  public options: GridsterConfig;
  public dashboard: Array<GridsterItem> = [];
  public consoleStatus: 'up' | 'down' = 'down';
  public page = {
    mobile: (window.innerWidth < 1024),
  };

  constructor(
    public $toastr: ToastrService,
    private $modal: NgbModal,
    private $ws: WsService,
    public $auth: AuthService,
    public $plugin: ManagePluginsService,
    public $md: MobileDetectService,
  ) { }

  ngOnInit() {
    this.options = {
      mobileBreakpoint: 1023,
      keepFixedHeightInMobile: false,
      itemChangeCallback: this.gridChangedEvent.bind(this),
      itemResizeCallback: this.gridResizeEvent.bind(this),
      draggable: {
        enabled: this.isLayoutUnlocked(),
      },
      resizable: {
        enabled: this.isLayoutUnlocked(),
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

    if (this.io.socket.connected) {
      this.getLayout();
      this.consoleStatus = 'up';
    } else {
      this.consoleStatus = 'down';

      // get the dashboard layout when the server is up
      this.io.connected.pipe(take(1)).subscribe(() => {
        this.getLayout();
      });
    }

    this.io.connected.subscribe(async () => {
      this.consoleStatus = 'up';
      this.io.socket.emit('monitor-server-status');
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

    // this allows widgets to trigger a save to the grid layout
    // eg. when the order of the accessories in the accessories widget changes
    this.saveWidgetsEvent.subscribe({
      next: () => {
        this.gridChangedEvent();
      },
    });
  }

  getLayout() {
    this.io.request('get-dashboard-layout').subscribe(
      (layout) => {
        if (!layout.length) {
          return this.resetLayout();
        }
        this.setLayout(layout);
      },
    );
  }

  setLayout(layout) {
    this.dashboard = layout.map((item) => {
      item.$resizeEvent = new Subject();
      item.$configureEvent = new Subject();
      item.$saveWidgetsEvent = this.saveWidgetsEvent;
      return item;
    });
  }

  resetLayout() {
    this.setLayout(require('./default-dashboard-layout.json'));
    this.gridChangedEvent();
  }

  isIos() {
    try {
      if (/iPad|iPhone|iPod/.test(navigator.platform)) {
        return true;
      } else {
        return navigator.maxTouchPoints &&
          navigator.maxTouchPoints > 2 &&
          /MacIntel/.test(navigator.platform);
      }
    } catch (e) {
      return false;
    }
  }

  isLayoutUnlocked() {
    if (localStorage.getItem(`${this.$auth.env.instanceId}-dashboard-locked`) === 'true' || this.isIos()) {
      return false;
    }
    return this.$auth.user.admin;
  }

  lockLayout() {
    localStorage.setItem(`${this.$auth.env.instanceId}-dashboard-locked`, 'true');
    this.options.draggable.enabled = false;
    this.options.resizable.enabled = false;
    this.options.api.optionsChanged();
  }

  unlockLayout() {
    localStorage.removeItem(`${this.$auth.env.instanceId}-dashboard-locked`);
    this.options.draggable.enabled = true;
    this.options.resizable.enabled = true;
    this.options.api.optionsChanged();
  }

  gridResizeEvent(item, itemComponent) {
    itemComponent.item.$resizeEvent.next('resize');
    this.page.mobile = (window.innerWidth < 1024);
  }

  async gridChangedEvent() {
    // sort the array to ensure mobile displays correctly
    this.dashboard.sort((a: any, b: any) => {
      if (a.mobileOrder < b.mobileOrder) {
        return -1;
      }
      if (b.mobileOrder > b.mobileOrder) {
        return 1;
      }
      return 0;
    });

    // remove private properties
    const layout = this.dashboard.map((item) => {
      const resp = {};
      for (const key of Object.keys(item)) {
        if (!key.startsWith('$')) {
          resp[key] = item[key];
        }
      }
      return resp;
    });

    // save to server
    try {
      await this.io.request('set-dashboard-layout', layout).toPromise();
    } catch (e) {
      console.error('Failed to save dashboard layout');
      console.error(e);
    }
  }

  addWidget() {
    const ref = this.$modal.open(WidgetAddComponent, { size: 'lg' });
    ref.componentInstance.dashboard = this.dashboard;
    ref.componentInstance.resetLayout = this.resetLayout.bind(this);
    ref.componentInstance.lockLayout = this.lockLayout.bind(this);
    ref.componentInstance.unlockLayout = this.unlockLayout.bind(this);
    ref.componentInstance.isLayoutUnlocked = !this.isLayoutUnlocked();

    ref.result
      .then((widget) => {
        const item = {
          x: undefined,
          y: undefined,
          component: widget.component,
          cols: widget.cols,
          rows: widget.rows,
          mobileOrder: widget.mobileOrder,
          hideOnMobile: widget.hideOnMobile,
          $resizeEvent: new Subject(),
          $configureEvent: new Subject(),
          $saveWidgetsEvent: this.saveWidgetsEvent,
        };

        this.dashboard.push(item);

        if (widget.requiresConfig) {
          this.manageWidget(item);
        }

        setTimeout(() => {
          const widgetElement = document.getElementById(widget.component);
          widgetElement.scrollIntoView();
        }, 500);
      })
      .catch(() => {
        // modal closed
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
        this.gridChangedEvent();
        item.$configureEvent.next();
      });
  }

  ngOnDestroy() {
    this.io.end();
    this.saveWidgetsEvent.complete();
  }

}
