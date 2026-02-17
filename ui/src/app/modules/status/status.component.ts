import { ChangeDetectionStrategy, Component, createEnvironmentInjector, EnvironmentInjector, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe } from '@ngx-translate/core'
import { Gridster, GridsterConfig, GridsterItem, GridsterItemConfig } from 'angular-gridster2'
import { firstValueFrom, Subject } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { NotificationService } from '@/app/core/communication/notification.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { SpinnerComponent } from '@/app/core/components/spinner/spinner.component'
import { WIDGET_CONTROL_MODAL_DATA, WIDGET_VISIBILITY_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { HomebridgeStatusResponse } from '@/app/core/server.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'
import { TerminalNavigationGuardService } from '@/app/core/utilities/terminal-navigation-guard.service'
import { CreditsComponent } from '@/app/modules/status/credits/credits.component'
import { WidgetControlComponent } from '@/app/modules/status/widget-control/widget-control.component'
import { WidgetVisibilityComponent } from '@/app/modules/status/widget-visibility/widget-visibility.component'
import { AVAILABLE_WIDGETS, WidgetsComponent } from '@/app/modules/status/widgets/widgets.component'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status.component.html',
  styleUrl: './status.component.scss',
  standalone: true,
  imports: [
    NgbTooltip,
    SpinnerComponent,
    Gridster,
    GridsterItem,
    WidgetsComponent,
    TranslatePipe,
  ],
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class StatusComponent implements OnInit, OnDestroy {
  private injector = inject(EnvironmentInjector)
  private $auth = inject(AuthService)
  private $modal = inject(NgbModal)
  private $navigationGuard = inject(TerminalNavigationGuardService)
  private $notification = inject(NotificationService)
  private $settings = inject(SettingsService)
  private $ws = inject(WsService)
  private readonly isUnlocked = signal(false)
  private io: IoNamespace

  public isAdmin = this.$auth.user.admin
  public isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')
  public saveWidgetsEvent = new Subject()
  public options: GridsterConfig
  public readonly dashboard = signal<Array<GridsterItemConfig>>([])
  public readonly consoleStatus = signal<'up' | 'down'>('down')
  public currentYear: number
  public readonly page = signal({
    mobile: (window.innerWidth < 1024),
    showWidgetConfigure: (window.innerWidth < 576),
  })

  public ngOnInit() {
    // Set page title (status page should only show instance name)
    this.$settings.setPageTitle()

    this.currentYear = new Date().getFullYear()
    this.io = this.$ws.connectToNamespace('status')
    this.options = {
      mobileBreakpoint: 1023,
      keepFixedHeightInMobile: false,
      itemChangeCallback: this.gridChangedEvent.bind(this),
      itemResizeCallback: this.gridResizeEvent.bind(this),
      draggable: {
        enabled: this.isUnlocked(),
      },
      resizable: {
        enabled: this.isUnlocked(),
      },
      gridType: 'verticalFixed',
      margin: 8,
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

    // Subscribe for reconnections
    this.io.connected.subscribe(() => {
      this.consoleStatus.set('up')
      this.io.socket.emit('monitor-server-status')
      this.getLayout()
    })

    // Check if already connected and initialize immediately
    if (this.io.socket.connected) {
      this.consoleStatus.set('up')
      this.io.socket.emit('monitor-server-status')
      this.getLayout()
    } else {
      this.consoleStatus.set('down')
    }

    this.io.socket.on('disconnect', () => {
      this.consoleStatus.set('down')
    })

    this.io.socket.on('homebridge-status', (data: HomebridgeStatusResponse) => {
      // Check if client is up-to-date
      if (data.packageVersion && data.packageVersion !== this.$settings.uiVersion) {
        window.location.reload()
      }
    })

    // This allows widgets to trigger a save to the grid layout
    // E.g. when the order of the accessories in the accessories widget changes
    this.saveWidgetsEvent.subscribe({
      next: () => {
        void this.gridChangedEvent()
      },
    })

    // If raspberry pi, do a check for throttled
    if (this.$settings.env.runningOnRaspberryPi) {
      this.io.request('get-raspberry-pi-throttled-status').subscribe((throttled) => {
        this.$notification.raspberryPiThrottled.next(throttled)
      })
    }
  }

  public lockLayout() {
    this.options = {
      ...this.options,
      draggable: { enabled: false },
      resizable: { enabled: false },
    }
    this.isUnlocked.set(false)
    this.setLayout(this.dashboard())
  }

  public unlockLayout() {
    this.options = {
      ...this.options,
      draggable: { enabled: true },
      resizable: { enabled: true },
    }
    this.isUnlocked.set(true)
    this.setLayout(this.dashboard())
  }

  public async addWidget(): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: WIDGET_VISIBILITY_MODAL_DATA,
      useValue: {
        dashboard: this.dashboard(),
        resetLayout: this.resetLayout.bind(this),
        lockLayout: this.lockLayout.bind(this),
        unlockLayout: this.unlockLayout.bind(this),
      },
    }], this.injector)

    const ref = this.$modal.open(WidgetVisibilityComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const widget = await ref.result
      const currentDashboard = this.dashboard()
      const index = currentDashboard.findIndex(x => x.component === widget.component)
      if (index > -1) {
        // Widget already exists, remove it
        const updated = [...currentDashboard]
        updated.splice(index, 1)
        this.dashboard.set(updated)
        void this.gridChangedEvent()
        return
      }

      // Add the widget
      const item: Widget = {
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
        draggable: this.options.draggable.enabled,
      }

      this.dashboard.set([...currentDashboard, item])

      if (widget.requiresConfig) {
        void this.manageWidget(item)
      }

      setTimeout(() => {
        const widgetElement = document.getElementById(widget.component)
        widgetElement.scrollIntoView()
      }, 500)
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public async manageWidget(item: Widget): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: WIDGET_CONTROL_MODAL_DATA,
      useValue: {
        widget: item,
      },
    }], this.injector)

    const ref = this.$modal.open(WidgetControlComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
    try {
      await ref.result
      // Update the dashboard signal to trigger change detection with new object reference
      const currentDashboard = this.dashboard()
      const index = currentDashboard.findIndex(w => w.component === item.component)
      if (index > -1) {
        // Create new array with new object reference for the modified widget
        const updated = [...currentDashboard]
        updated[index] = {
          ...updated[index],
          // Preserve the Subjects
          $resizeEvent: updated[index].$resizeEvent,
          $configureEvent: updated[index].$configureEvent,
          $saveWidgetsEvent: updated[index].$saveWidgetsEvent,
        }
        this.dashboard.set(updated)

        // Defer to avoid NG0100 error when widget updates its configuration
        queueMicrotask(() => updated[index].$configureEvent.next())
      }
      void this.gridChangedEvent()
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public openCreditsModal() {
    this.$modal.open(CreditsComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public ngOnDestroy() {
    this.io.end()
    this.saveWidgetsEvent.complete()
  }

  private getLayout() {
    this.io.request('get-dashboard-layout').subscribe((layout) => {
      if (!layout.length) {
        return this.resetLayout()
      }

      let saveNeeded = false
      this.setLayout(layout.map((item: GridsterItemConfig) => {
        // Renamed between v4.68.0 and v4.69.0
        if (item.component === 'HomebridgeStatusWidgetComponent') {
          item.component = 'UpdateInfoWidgetComponent'
          saveNeeded = true
        } else if (item.component === 'ChildBridgeWidgetComponent') {
          item.component = 'BridgesWidgetComponent'
          saveNeeded = true
        }

        // Hide terminal for non-admin users
        if (item.component === 'TerminalWidgetComponent' && !this.isAdmin) {
          return null
        }

        // Hide matter qr code if not supported
        if (item.component === 'MatterQrcodeWidgetComponent' && !this.isMatterSupported) {
          return null
        }

        // Hide items not in the list of available widgets
        if (!AVAILABLE_WIDGETS.includes(item.component)) {
          return null
        }

        // If accessory control is disabled (insecure mode is disabled), hide the accessories widget
        if (item.component === 'AccessoriesWidgetComponent' && !this.$settings.env.enableAccessories) {
          return null
        }

        return item
      }).filter(Boolean))

      if (saveNeeded) {
        void this.gridChangedEvent()
      }
    })
  }

  private setLayout(layout: GridsterItemConfig[]) {
    this.dashboard.set(layout.map(item => ({
      // Create new object instead of mutating to ensure proper signal change detection
      ...item,
      // Preserve existing Subjects to maintain subscriptions, or create new ones if they don't exist
      $resizeEvent: item.$resizeEvent || new Subject(),
      $configureEvent: item.$configureEvent || new Subject(),
      $saveWidgetsEvent: this.saveWidgetsEvent,
      draggable: this.options.draggable.enabled,
    })))
  }

  private resetLayout() {
    // eslint-disable-next-line ts/no-require-imports
    this.setLayout(require('./default-dashboard-layout.json'))
    void this.gridChangedEvent()
  }

  private gridResizeEvent(_item: GridsterItemConfig) {
    _item.$resizeEvent.next('resize')
    this.page.set({
      mobile: (window.innerWidth < 1024),
      showWidgetConfigure: (window.innerWidth < 576),
    })
  }

  private async gridChangedEvent() {
    // Sort the array to ensure mobile displays correctly
    const currentDashboard = [...this.dashboard()]
    currentDashboard.sort((a: GridsterItemConfig, b: GridsterItemConfig) => a.mobileOrder - b.mobileOrder)
    this.dashboard.set(currentDashboard)

    // Remove private properties
    const layout = currentDashboard.map((item) => {
      // eslint-disable-next-line unused-imports/no-unused-vars
      const { $resizeEvent, $configureEvent, $saveWidgetsEvent, ...cleanItem } = item
      return cleanItem
    })

    // Save to server
    try {
      await firstValueFrom(this.io.request('set-dashboard-layout', layout))
    } catch (e) {
      console.error('Failed to save dashboard layout')
      console.error(e)
    }
  }

  onBeforeUnload(event: BeforeUnloadEvent) {
    // Check if any terminal widget needs to warn about navigation
    const hasTerminalWidget = this.dashboard().some(item => item.component === 'TerminalWidgetComponent')

    if (hasTerminalWidget) {
      return this.$navigationGuard.handleBeforeUnload(event)
    }
    return undefined
  }

  public canDeactivate(): Promise<boolean> | boolean {
    // Check if any terminal widget needs to confirm navigation
    const hasTerminalWidget = this.dashboard().some(item => item.component === 'TerminalWidgetComponent')

    if (!hasTerminalWidget) {
      return true
    }

    return this.$navigationGuard.canDeactivate()
  }
}
