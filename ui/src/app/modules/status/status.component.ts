import { AuthService } from '@/app/core/auth/auth.service'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { NotificationService } from '@/app/core/notification.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { CreditsComponent } from '@/app/modules/status/credits/credits.component'
import { WidgetControlComponent } from '@/app/modules/status/widget-control/widget-control.component'
import { WidgetVisibilityComponent } from '@/app/modules/status/widget-visibility/widget-visibility.component'
import { Component, OnDestroy, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { GridsterConfig, GridsterItem } from 'angular-gridster2'
import { firstValueFrom, Subject } from 'rxjs'
import { take } from 'rxjs/operators'

@Component({
  templateUrl: './status.component.html',
  styleUrls: ['./status.component.scss'],
})
export class StatusComponent implements OnInit, OnDestroy {
  public saveWidgetsEvent = new Subject()
  public options: GridsterConfig
  public dashboard: Array<GridsterItem> = []
  public consoleStatus: 'up' | 'down' = 'down'
  public page = {
    mobile: (window.innerWidth < 1024),
  }

  private io: IoNamespace

  constructor(
    public $auth: AuthService,
    private $modal: NgbModal,
    private $notification: NotificationService,
    public $settings: SettingsService,
    private $ws: WsService,
  ) {}

  ngOnInit() {
    this.io = this.$ws.connectToNamespace('status')
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
    }

    if (this.io.socket.connected) {
      this.getLayout()
      this.consoleStatus = 'up'
    } else {
      this.consoleStatus = 'down'

      // get the dashboard layout when the server is up
      this.io.connected.pipe(take(1)).subscribe(() => {
        this.getLayout()
      })
    }

    this.io.connected.subscribe(async () => {
      this.consoleStatus = 'up'
      this.io.socket.emit('monitor-server-status')
    })

    this.io.socket.on('disconnect', () => {
      this.consoleStatus = 'down'
    })

    this.io.socket.on('homebridge-status', (data) => {
      // check if client is up-to-date
      if (data.packageVersion && data.packageVersion !== this.$settings.uiVersion) {
        window.location.reload()
      }
    })

    // this allows widgets to trigger a save to the grid layout
    // e.g. when the order of the accessories in the accessories widget changes
    this.saveWidgetsEvent.subscribe({
      next: () => {
        this.gridChangedEvent()
      },
    })

    // if raspberry pi, do a check for throttled
    if (this.$settings.env.runningOnRaspberryPi) {
      this.io.request('get-raspberry-pi-throttled-status').subscribe((throttled) => {
        this.$notification.raspberryPiThrottled.next(throttled)
      })
    }
  }

  getLayout() {
    this.io.request('get-dashboard-layout').subscribe(
      (layout) => {
        if (!layout.length) {
          return this.resetLayout()
        }
        this.setLayout(layout)
      },
    )
  }

  setLayout(layout: any[]) {
    this.dashboard = layout.map((item) => {
      item.$resizeEvent = new Subject()
      item.$configureEvent = new Subject()
      item.$saveWidgetsEvent = this.saveWidgetsEvent
      item.draggable = this.options.draggable.enabled
      return item
    })
  }

  resetLayout() {
    // eslint-disable-next-line ts/no-require-imports
    this.setLayout(require('./default-dashboard-layout.json'))
    this.gridChangedEvent()
  }

  isIos() {
    try {
      if (/iPad|iPhone|iPod/.test(navigator.platform)) {
        return true
      } else {
        return navigator.maxTouchPoints
          && navigator.maxTouchPoints > 2
          && /MacIntel/.test(navigator.platform)
      }
    } catch (e) {
      return false
    }
  }

  isLayoutUnlocked() {
    if (localStorage.getItem(`${this.$settings.env.instanceId}-dashboard-locked`) === 'true' || this.isIos()) {
      return false
    }
    return this.$auth.user.admin
  }

  lockLayout() {
    localStorage.setItem(`${this.$settings.env.instanceId}-dashboard-locked`, 'true')
    this.options.draggable.enabled = false
    this.options.resizable.enabled = false
    this.options.api.optionsChanged()
    this.setLayout(this.dashboard)
  }

  unlockLayout() {
    localStorage.removeItem(`${this.$settings.env.instanceId}-dashboard-locked`)
    this.options.draggable.enabled = true
    this.options.resizable.enabled = true
    this.options.api.optionsChanged()
    this.setLayout(this.dashboard)
  }

  gridResizeEvent(_item: any, itemComponent: any) {
    itemComponent.item.$resizeEvent.next('resize')
    this.page.mobile = (window.innerWidth < 1024)
  }

  async gridChangedEvent() {
    // sort the array to ensure mobile displays correctly
    this.dashboard.sort((a: any, b: any) => {
      if (a.mobileOrder < b.mobileOrder) {
        return -1
      }

      // eslint-disable-next-line no-self-compare
      if (b.mobileOrder > b.mobileOrder) {
        return 1
      }
      return 0
    })

    // remove private properties
    const layout = this.dashboard.map((item) => {
      const resp = {}
      for (const key of Object.keys(item)) {
        if (!key.startsWith('$')) {
          resp[key] = item[key]
        }
      }
      return resp
    })

    // save to server
    try {
      await firstValueFrom(this.io.request('set-dashboard-layout', layout))
    } catch (e) {
      console.error('Failed to save dashboard layout')
      console.error(e)
    }
  }

  addWidget() {
    const ref = this.$modal.open(WidgetVisibilityComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.dashboard = this.dashboard
    ref.componentInstance.resetLayout = this.resetLayout.bind(this)
    ref.componentInstance.lockLayout = this.lockLayout.bind(this)
    ref.componentInstance.unlockLayout = this.unlockLayout.bind(this)
    ref.componentInstance.isLayoutUnlocked = !this.isLayoutUnlocked()

    ref.result
      .then((widget) => {
        const index = this.dashboard.findIndex(x => x.component === widget.component)
        if (index > -1) {
          // Widget already exists, remove it
          this.dashboard.splice(index, 1)
          this.gridChangedEvent()
          return
        }

        // Add the widget
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
        }

        this.dashboard.push(item)

        if (widget.requiresConfig) {
          this.manageWidget(item)
        }

        setTimeout(() => {
          const widgetElement = document.getElementById(widget.component)
          widgetElement.scrollIntoView()
        }, 500)
      })
      .catch(() => {
        // modal closed
      })
  }

  manageWidget(item) {
    const ref = this.$modal.open(WidgetControlComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.widget = item
    ref.result
      .then(() => {
        this.gridChangedEvent()
        item.$configureEvent.next(undefined)
      })
      .catch(() => {
        // modal closed
      })
  }

  openCreditsModal() {
    this.$modal.open(CreditsComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  openPnpmModal() {
    const ref = this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.title = 'pnpm'
    ref.componentInstance.subtitle = 'This warning is visible as you are using the pnpm package manager.'
    ref.componentInstance.message = 'The next version of Homebridge UI will no longer support pnpm.'
    + ' You should consider updating your Homebridge instance to use npm instead.'
    + ' This can be done by following the update instructions in the Homebridge APT package documentation.'
    + ' See the link below for more information.'
    ref.componentInstance.faIconClass = 'fab fa-fw fa-npm red-text'

    ref.componentInstance.ctaButtonLabel = 'Update Info'
    ref.componentInstance.ctaButtonLink = 'https://github.com/homebridge/homebridge-apt-pkg/blob/latest/README.md#using-apt'
  }

  ngOnDestroy() {
    this.io.end()
    this.saveWidgetsEvent.complete()
  }
}
