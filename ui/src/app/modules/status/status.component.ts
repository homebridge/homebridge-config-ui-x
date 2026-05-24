import { ChangeDetectionStrategy, Component, createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
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
import { WidgetVisibilityComponent, WidgetVisibilityEntry } from '@/app/modules/status/widget-visibility/widget-visibility.component'
import { AVAILABLE_WIDGETS, WIDGETS_WITH_SETTINGS, WidgetsComponent } from '@/app/modules/status/widgets/widgets.component'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  selector: 'app-status',
  imports: [
    NgbTooltip,
    SpinnerComponent,
    Gridster,
    GridsterItem,
    WidgetsComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './status.component.html',
  styleUrl: './status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class StatusComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef)
  private injector = inject(EnvironmentInjector)
  private $auth = inject(AuthService)
  private $modal = inject(NgbModal)
  private $navigationGuard = inject(TerminalNavigationGuardService)
  private $notification = inject(NotificationService)
  private $settings = inject(SettingsService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private readonly isUnlocked = signal(false)
  private io!: IoNamespace

  public isAdmin = this.$auth.user.admin
  public isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')
  public saveWidgetsEvent = new Subject()
  public options!: GridsterConfig
  public readonly dashboard = signal<Widget[]>([])
  public readonly consoleStatus = signal<'up' | 'down'>('down')
  public currentYear!: number
  public readonly page = signal({
    mobile: (window.innerWidth < 1024),
    showWidgetConfigure: (window.innerWidth < 576),
  })

  public widgetsWithSettings: readonly string[] = WIDGETS_WITH_SETTINGS

  // Keyboard-driven widget reorder mode for screen-reader / keyboard-only users.
  // The default gridster drag-and-drop is mouse-only; this provides a parallel
  // listbox-based path: arrow keys move the selected widget, escape exits.
  public readonly reorderMode = signal(false)
  public readonly selectedReorderComponent = signal<string | null>(null)
  public readonly actionLiveMessage = signal('')
  // True only between entering reorder mode and the first keystroke — drives the
  // aria-describedby that reads the keyboard instructions once on entry.
  public readonly showReorderHelp = signal(false)
  private actionTick = 0

  public get reorderComponents(): string[] {
    return this.dashboard()
      .map(x => x?.component)
      .filter((c): c is string => typeof c === 'string' && c.length > 0)
  }

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

    // Subscribe for reconnections — fires once for cache-hit-while-connected
    // and on every (re)connect thereafter. `consoleStatus` starts as 'down' and
    // is flipped back to 'down' by the 'disconnect' handler below.
    this.io.connected!.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.consoleStatus.set('up')
      this.io.socket.emit('monitor-server-status')
      this.getLayout()
    })

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
    this.saveWidgetsEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        void this.gridChangedEvent()
      },
    })

    // If raspberry pi, do a check for throttled
    if (this.$settings.env.runningOnRaspberryPi) {
      this.io.request('get-raspberry-pi-throttled-status').pipe(takeUntilDestroyed(this.destroyRef)).subscribe((throttled) => {
        this.$notification.raspberryPiThrottled.set(throttled)
      })
    }
  }

  public lockLayout() {
    // Locking means "I'm done editing": if the user is mid-reorder, save the new
    // order and return to the grid before locking.
    if (this.reorderMode()) {
      this.exitReorderMode(true, false)
    }
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
      const entries: WidgetVisibilityEntry[] = await ref.result
      const currentDashboard = [...this.dashboard()]

      for (const entry of entries) {
        const existingIndex = currentDashboard.findIndex(x => x.component === entry.component)
        const visibleAnywhere = entry.showOnDesktop || entry.showOnMobile

        if (visibleAnywhere && existingIndex === -1) {
          // Widget needs to be in dashboard but isn't — add it
          // Place at the bottom of the grid so it doesn't disrupt existing layout
          const maxY = currentDashboard.reduce((max, item) => Math.max(max, (item.y ?? 0) + (item.rows ?? 0)), 0)
          currentDashboard.push({
            x: 0,
            y: maxY,
            component: entry.component,
            cols: entry.cols,
            rows: entry.rows,
            mobileOrder: entry.mobileOrder,
            hideOnDesktop: entry.hideOnDesktop,
            hideOnMobile: entry.hideOnMobile,
            $resizeEvent: new Subject(),
            $configureEvent: new Subject(),
            $saveWidgetsEvent: this.saveWidgetsEvent,
            draggable: this.options.draggable!.enabled!,
          })
        } else if (!visibleAnywhere && existingIndex > -1) {
          // Widget hidden on both desktop and mobile — remove it
          currentDashboard.splice(existingIndex, 1)
        } else if (visibleAnywhere && existingIndex > -1) {
          // Widget exists — update visibility flags
          currentDashboard[existingIndex] = {
            ...currentDashboard[existingIndex],
            hideOnDesktop: entry.hideOnDesktop,
            hideOnMobile: entry.hideOnMobile,
            $resizeEvent: currentDashboard[existingIndex].$resizeEvent,
            $configureEvent: currentDashboard[existingIndex].$configureEvent,
            $saveWidgetsEvent: currentDashboard[existingIndex].$saveWidgetsEvent,
          }
        }
      }

      this.dashboard.set(currentDashboard)
      void this.gridChangedEvent()
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

  public manageWidgetByComponent(component: string): void {
    const item = this.dashboard().find(x => x?.component === component)
    if (item) {
      void this.manageWidget(item)
    }
  }

  public toggleReorderMode(): void {
    if (!this.reorderMode()) {
      this.enterReorderMode()
    } else {
      this.exitReorderMode(true, true)
    }
  }

  public setSelectedReorderComponent(component: string): void {
    if (!this.reorderMode()) {
      return
    }
    const list = this.reorderComponents
    if (!list.includes(component)) {
      return
    }
    this.selectedReorderComponent.set(component)
  }

  public getReorderItemAriaLabel(component: string): string {
    const name = this.getWidgetDisplayName(component)
    const list = this.reorderComponents
    const position = list.indexOf(component) + 1
    const total = list.length || 1
    return this.$translate.instant('status.reorder.item_label', { name, position, total })
  }

  public getWidgetSettingsAriaLabel(item: { component?: string }): string {
    const name = this.getWidgetDisplayName(item?.component || '')
    return this.$translate.instant('status.reorder.widget_settings', { name })
  }

  public onReorderKeydown(event: KeyboardEvent): void {
    if (!this.reorderMode()) {
      return
    }

    // The instructions only need to be read once, on entry.
    if (this.showReorderHelp()) {
      this.showReorderHelp.set(false)
    }

    let handled = true
    switch (event.key) {
      case 'Tab':
        this.selectNext(event.shiftKey)
        break
      case 'ArrowUp':
        this.moveSelectedBy(-1)
        break
      case 'ArrowDown':
        this.moveSelectedBy(1)
        break
      case 'Home':
      case 'ArrowLeft':
        this.moveSelectedToEdge('top')
        break
      case 'End':
      case 'ArrowRight':
        this.moveSelectedToEdge('bottom')
        break
      case 'Escape':
        this.exitReorderMode(true, true)
        break
      default:
        handled = false
    }

    if (handled) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  private enterReorderMode(): void {
    const list = this.reorderComponents
    this.reorderMode.set(true)
    this.selectedReorderComponent.set(list[0] || null)
    // Surface the keyboard instructions as the first widget's accessible
    // description (see #reorder-instructions in the template). The screen reader
    // reads them right after the widget name + position, so we can move focus
    // immediately instead of racing a live-region announcement.
    this.showReorderHelp.set(true)

    const selected = this.selectedReorderComponent()
    if (selected) {
      // Defer one tick so the listbox has rendered before we focus into it.
      setTimeout(() => {
        if (this.reorderMode()) {
          this.focusReorderItem(selected)
        }
      }, 0)
    }
  }

  private exitReorderMode(apply: boolean, announce: boolean): void {
    if (apply) {
      void this.gridChangedEvent()
    }
    this.reorderMode.set(false)
    this.selectedReorderComponent.set(null)
    this.showReorderHelp.set(false)
    if (announce) {
      this.speakAction(this.$translate.instant('status.reorder.disabled'))
    }
    // Return focus to the toggle button so keyboard users don't lose their place
    setTimeout(() => document.getElementById('reorder-toggle-button')?.focus(), 0)
  }

  private selectNext(prev: boolean): void {
    const list = this.reorderComponents
    if (!list.length) {
      return
    }
    const current = this.selectedReorderComponent()
    const idx = current && list.includes(current) ? list.indexOf(current) : 0
    const nextIdx = prev ? (idx - 1 + list.length) % list.length : (idx + 1) % list.length
    const next = list[nextIdx]
    this.selectedReorderComponent.set(next)
    setTimeout(() => this.focusReorderItem(next), 0)
  }

  private moveSelectedBy(delta: number): void {
    const selected = this.selectedReorderComponent()
    if (selected && this.moveComponent(selected, delta)) {
      setTimeout(() => this.focusReorderItem(selected), 0)
    }
  }

  /**
   * Move a widget up (delta -1) or down (delta +1) in the order. Shared by the
   * arrow-key handler and the per-row Up/Down buttons, so pointer and touch
   * users can reorder too — not just keyboard. Returns true if a move happened.
   */
  public moveComponent(component: string, delta: number): boolean {
    const list = this.reorderComponents
    if (!list.includes(component)) {
      return false
    }
    const target = list.indexOf(component) + delta
    if (target < 0 || target >= list.length) {
      return false
    }

    this.selectedReorderComponent.set(component)
    this.reorderTo(component, target)
    this.speakAction(this.$translate.instant('status.reorder.moved', {
      name: this.getWidgetDisplayName(component),
      position: target + 1,
      total: list.length,
    }))
    return true
  }

  private moveSelectedToEdge(edge: 'top' | 'bottom'): void {
    const list = this.reorderComponents
    const selected = this.selectedReorderComponent()
    if (!selected || !list.includes(selected)) {
      return
    }
    const target = edge === 'top' ? 0 : list.length - 1
    this.reorderTo(selected, target)

    const name = this.getWidgetDisplayName(selected)
    const edgeLabel = this.$translate.instant(edge === 'top' ? 'status.reorder.edge_top' : 'status.reorder.edge_bottom')
    this.speakAction(this.$translate.instant('status.reorder.moved_to_edge', {
      name,
      edge: edgeLabel,
      position: target + 1,
      total: list.length,
    }))
    setTimeout(() => this.focusReorderItem(selected), 0)
  }

  private reorderTo(component: string, targetIdx: number): void {
    const current = [...this.dashboard()]
    const fromIdx = current.findIndex(x => x?.component === component)
    if (fromIdx < 0) {
      return
    }
    const [item] = current.splice(fromIdx, 1)
    current.splice(targetIdx, 0, item)
    // Keep mobileOrder in sync so the rendered grid matches the list order
    current.forEach((w, i) => {
      w.mobileOrder = i
    })
    this.dashboard.set(current)
  }

  private focusReorderItem(component: string): void {
    const el = document.getElementById(`reorder-item-${component}`)
    if (el) {
      el.focus()
    }
  }

  private speakAction(message: string): void {
    // Zero-width-space trick to force the live region to re-announce when the
    // same message is set twice in a row
    this.actionTick = (this.actionTick + 1) % 10
    this.actionLiveMessage.set(`${message}${'​'.repeat(this.actionTick)}`)
  }

  public getWidgetDisplayName(component: string): string {
    switch (component) {
      case 'UpdateInfoWidgetComponent':
        return this.$translate.instant('status.services.updates')
      case 'WeatherWidgetComponent':
        return this.$translate.instant('status.widget.weather.title_weather')
      case 'AccessoriesWidgetComponent':
        return this.$translate.instant('menu.label_accessories')
      case 'BridgesWidgetComponent':
        return this.$translate.instant('child_bridge.bridges')
      case 'CpuWidgetComponent':
        return this.$translate.instant('status.cpu.title_cpu')
      case 'MemoryWidgetComponent':
        return this.$translate.instant('status.memory.title_memory')
      case 'NetworkWidgetComponent':
        return this.$translate.instant('status.network.title_network')
      case 'UptimeWidgetComponent':
        return this.$translate.instant('status.uptime.title_uptime')
      case 'SystemInfoWidgetComponent':
        return this.$translate.instant('status.widget.info')
      case 'HapQrcodeWidgetComponent':
        return this.$translate.instant('status.widget.add.label_pairing_code')
      case 'MatterQrcodeWidgetComponent':
        return this.$translate.instant('status.widget.add.matter_pairing_code')
      case 'HomebridgeLogsWidgetComponent':
        return this.$translate.instant('status.widget.homebridge_logs')
      case 'TerminalWidgetComponent':
        return `Homebridge ${this.$translate.instant('menu.docker.terminal')}`
      case 'ClockWidgetComponent':
        return this.$translate.instant('status.widget.clock')
      default: {
        const base = component
          .replace(/WidgetComponent$/, '')
          .replace(/Component$/, '')
          .replace(/Widget$/, '')
        return base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim() || component
      }
    }
  }

  public ngOnDestroy() {
    this.io.end!()
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
      draggable: this.options.draggable!.enabled!,
    }) as Widget))
  }

  private resetLayout() {
    // eslint-disable-next-line ts/no-require-imports
    const layout = require('./default-dashboard-layout.json')

    // If matter is not supported, remove the Matter QR code widget
    if (!this.isMatterSupported) {
      const index = layout.findIndex((item: GridsterItemConfig) => item.component === 'MatterQrcodeWidgetComponent')
      if (index !== -1) {
        layout.splice(index, 1)
      }
    }

    this.setLayout(layout)
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
    currentDashboard.sort((a, b) => a.mobileOrder - b.mobileOrder)
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
