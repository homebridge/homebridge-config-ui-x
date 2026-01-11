import { Component, HostListener, inject, OnDestroy, OnInit } from '@angular/core'
import { NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { GridsterComponent, GridsterConfig, GridsterItem, GridsterItemComponent } from 'angular-gridster2'
import { firstValueFrom, Subject } from 'rxjs'
import { take } from 'rxjs/operators'

import { SpinnerComponent } from '@/app//core/components/spinner/spinner.component'
import { AuthService } from '@/app/core/auth/auth.service'
import { NotificationService } from '@/app/core/notification.service'
import { HomebridgeStatusResponse } from '@/app/core/server.interfaces'
import { SettingsService } from '@/app/core/settings.service'
import { TerminalNavigationGuardService } from '@/app/core/terminal-navigation-guard.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { CreditsComponent } from '@/app/modules/status/credits/credits.component'
import { WidgetControlComponent } from '@/app/modules/status/widget-control/widget-control.component'
import { WidgetVisibilityComponent } from '@/app/modules/status/widget-visibility/widget-visibility.component'
import { AVAILABLE_WIDGETS, WidgetsComponent } from '@/app/modules/status/widgets/widgets.component'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './status.component.html',
  styleUrls: ['./status.component.scss'],
  standalone: true,
  imports: [
    NgbTooltip,
    SpinnerComponent,
    GridsterComponent,
    GridsterItemComponent,
    WidgetsComponent,
    TranslatePipe,
  ],
})
export class StatusComponent implements OnInit, OnDestroy {
  private $auth = inject(AuthService)
  private $modal = inject(NgbModal)
  private $navigationGuard = inject(TerminalNavigationGuardService)
  private $notification = inject(NotificationService)
  private $settings = inject(SettingsService)
  private $ws = inject(WsService)
  private $translate = inject(TranslateService)
  private isUnlocked = false
  private io: IoNamespace

  private actionTick = 0

  private reorderAnnounceTimer: any = null
  private reorderFocusDelayMs = 7000

  public isAdmin = this.$auth.user.admin
  public saveWidgetsEvent = new Subject()
  public options: GridsterConfig
  public dashboard: Array<GridsterItem> = []
  public consoleStatus: 'up' | 'down' = 'down'
  public currentYear: number
  public page = {
    mobile: (window.innerWidth < 1024),
    showWidgetConfigure: (window.innerWidth < 576),
  }

  public actionLiveMessage = ''

  public reorderMode = false
  public selectedReorderComponent: string | null = null

  public get reorderComponents(): string[] {
    return this.dashboard
      .map((x: any) => x?.component)
      .filter((c: any) => typeof c === 'string' && c.length > 0)
  }

  private speakAction(message: string) {
    this.actionTick = (this.actionTick + 1) % 10
    this.actionLiveMessage = `${message}${'\u200B'.repeat(this.actionTick)}`
  }

  private clearReorderAnnounceTimer() {
    if (this.reorderAnnounceTimer) {
      clearTimeout(this.reorderAnnounceTimer)
      this.reorderAnnounceTimer = null
    }
  }

  public ngOnInit() {
    this.$settings.setPageTitle()

    this.currentYear = new Date().getFullYear()
    this.io = this.$ws.connectToNamespace('status')
    this.options = {
      mobileBreakpoint: 1023,
      keepFixedHeightInMobile: false,
      itemChangeCallback: this.gridChangedEvent.bind(this),
      itemResizeCallback: this.gridResizeEvent.bind(this),
      draggable: {
        enabled: this.isUnlocked,
      },
      resizable: {
        enabled: this.isUnlocked,
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

    if (this.io.socket.connected) {
      this.getLayout()
      this.consoleStatus = 'up'
    } else {
      this.consoleStatus = 'down'
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

    this.io.socket.on('homebridge-status', (data: HomebridgeStatusResponse) => {
      if (data.packageVersion && data.packageVersion !== this.$settings.uiVersion) {
        window.location.reload()
      }
    })

    this.saveWidgetsEvent.subscribe({
      next: () => {
        this.gridChangedEvent()
      },
    })

    if (this.$settings.env.runningOnRaspberryPi) {
      this.io.request('get-raspberry-pi-throttled-status').subscribe((throttled) => {
        this.$notification.raspberryPiThrottled.next(throttled)
      })
    }
  }

  public lockLayout() {
    this.options.draggable.enabled = false
    this.options.resizable.enabled = false
    this.options.api.optionsChanged()
    this.isUnlocked = false

    this.exitReorderMode(false, false)

    this.setLayout(this.dashboard)
    this.speakAction('widgets locked, settings and re-ordering options hidden.')
  }

  public unlockLayout() {
    this.options.draggable.enabled = true
    this.options.resizable.enabled = true
    this.options.api.optionsChanged()
    this.isUnlocked = true
    this.setLayout(this.dashboard)
    this.speakAction('widgets unlocked, settings and re-ordering options available.')
  }

  public toggleReorderMode() {
    if (!this.reorderMode) {
      this.enterReorderMode()
      return
    }
    this.exitReorderMode(true, true)
  }

  private enterReorderMode() {
    this.sanitizeDashboard()
    this.reorderMode = true

    const list = this.reorderComponents
    this.selectedReorderComponent = list[0] || null

    this.speakAction(
      'Reorder mode enabled. Tab and Shift Tab move between widgets. Up and Down arrows move the selected widget. Left arrow moves to top. Right arrow moves to bottom. Press Escape to exit reorder mode.',
    )

    this.clearReorderAnnounceTimer()

    if (this.selectedReorderComponent) {
      this.reorderAnnounceTimer = setTimeout(() => {
        this.reorderAnnounceTimer = null
        if (!this.reorderMode) {
          return
        }
        if (!this.selectedReorderComponent) {
          return
        }
        this.focusReorderItem(this.selectedReorderComponent)
      }, this.reorderFocusDelayMs)
    }
  }

  private exitReorderMode(apply: boolean, announce: boolean) {
    this.clearReorderAnnounceTimer()

    if (apply) {
      this.applyReorderToDashboard()
      this.gridChangedEvent()
    }

    this.reorderMode = false
    this.selectedReorderComponent = null

    if (announce) {
      this.speakAction('Reorder mode disabled.')
    }
  }

  private sanitizeDashboard() {
    const before = this.dashboard.length
    this.dashboard = (this.dashboard as any[]).filter(x => x && typeof x.component === 'string' && x.component.length > 0)
    const after = this.dashboard.length

    if (after !== before && this.reorderMode) {
      this.syncReorderState()
    }
  }

  private syncReorderState() {
    this.sanitizeDashboard()

    const list = this.reorderComponents
    if (!list.length) {
      this.selectedReorderComponent = null
      return
    }

    if (!this.selectedReorderComponent || !list.includes(this.selectedReorderComponent)) {
      this.selectedReorderComponent = list[0]
    }

    if (this.reorderMode && this.selectedReorderComponent) {
      setTimeout(() => this.focusReorderItem(this.selectedReorderComponent!), 0)
    }
  }

  private applyReorderToDashboard() {
    const list = this.reorderComponents
    const byComponent = new Map<string, any>((this.dashboard as any[]).map(x => [x.component, x]))

    const reordered = list
      .map(c => byComponent.get(c))
      .filter(Boolean)

    for (let i = 0; i < reordered.length; i++) {
      reordered[i].mobileOrder = i
    }

    this.dashboard = reordered
  }

  public getReorderPosition(component: string): number {
    const list = this.reorderComponents
    const idx = list.indexOf(component)
    return idx > -1 ? idx + 1 : 1
  }

  public setSelectedReorderComponent(component: string) {
    if (!this.reorderMode) {
      return
    }

    const list = this.reorderComponents
    if (!list.includes(component)) {
      this.syncReorderState()
      return
    }

    this.selectedReorderComponent = component
  }

  public getReorderItemAriaLabel(component: string): string {
    const name = this.getWidgetDisplayName(component)
    const list = this.reorderComponents
    const pos = this.getReorderPosition(component)
    const total = list.length || 1
    return `${name}. Position ${pos} of ${total}.`
  }

  private focusReorderItem(component: string) {
    const el = document.getElementById(`reorder-item-${component}`) as HTMLElement | null
    if (el) {
      el.focus()
    }
  }

  private selectNext(prev: boolean) {
    if (!this.reorderMode) {
      return
    }

    const list = this.reorderComponents
    if (!list.length) {
      return
    }

    const current =
      this.selectedReorderComponent && list.includes(this.selectedReorderComponent)
        ? this.selectedReorderComponent
        : list[0]

    const idx = list.indexOf(current)
    const nextIdx = prev
      ? (idx - 1 + list.length) % list.length
      : (idx + 1) % list.length

    const nextComponent = list[nextIdx]
    this.selectedReorderComponent = nextComponent

    setTimeout(() => this.focusReorderItem(nextComponent), 0)
  }

  public onReorderKeydown(event: KeyboardEvent) {
    if (!this.reorderMode) {
      return
    }

    const key = event.key
    const shift = event.shiftKey

    let handled = true

    if (key === 'Tab') {
      this.selectNext(shift)
    } else if (key === 'ArrowUp') {
      this.moveSelectedBy(-1)
    } else if (key === 'ArrowDown') {
      this.moveSelectedBy(1)
    } else if (key === 'ArrowLeft') {
      this.moveSelectedToEdge('top')
    } else if (key === 'ArrowRight') {
      this.moveSelectedToEdge('bottom')
    } else if (key === 'Escape') {
      this.exitReorderMode(true, true)
    } else {
      handled = false
    }

    if (handled) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  private moveSelectedBy(delta: number) {
    const list = this.reorderComponents
    if (!list.length) {
      return
    }

    const selected =
      this.selectedReorderComponent && list.includes(this.selectedReorderComponent)
        ? this.selectedReorderComponent
        : list[0]

    const idx = list.indexOf(selected)
    const target = idx + delta
    if (target < 0 || target >= list.length) {
      return
    }

    const byComponent = new Map<string, any>((this.dashboard as any[]).map(x => [x.component, x]))
    const newOrder = [...list]
    newOrder.splice(idx, 1)
    newOrder.splice(target, 0, selected)

    this.dashboard = newOrder.map(c => byComponent.get(c)).filter(Boolean)
    this.selectedReorderComponent = selected

    const name = this.getWidgetDisplayName(selected)
    this.speakAction(`Moved ${name} to position ${target + 1} of ${newOrder.length}.`)

    setTimeout(() => this.focusReorderItem(selected), 0)
  }

  private moveSelectedToEdge(edge: 'top' | 'bottom') {
    const list = this.reorderComponents
    if (!list.length) {
      return
    }

    const selected =
      this.selectedReorderComponent && list.includes(this.selectedReorderComponent)
        ? this.selectedReorderComponent
        : list[0]

    const idx = list.indexOf(selected)
    if (idx < 0) {
      return
    }

    const byComponent = new Map<string, any>((this.dashboard as any[]).map(x => [x.component, x]))
    const newOrder = [...list]
    newOrder.splice(idx, 1)

    const target = edge === 'top' ? 0 : newOrder.length
    newOrder.splice(target, 0, selected)

    this.dashboard = newOrder.map(c => byComponent.get(c)).filter(Boolean)
    this.selectedReorderComponent = selected

    const finalPos = edge === 'top' ? 1 : newOrder.length
    const name = this.getWidgetDisplayName(selected)
    this.speakAction(`Moved ${name} to ${edge}, position ${finalPos} of ${newOrder.length}.`)

    setTimeout(() => this.focusReorderItem(selected), 0)
  }

  public manageWidgetByComponent(component: string) {
    const item = (this.dashboard as any[]).find(x => x?.component === component) as Widget | undefined
    if (!item) {
      return
    }
    this.manageWidget(item)
  }

  public addWidget() {
    this.sanitizeDashboard()
    this.syncReorderState()

    const ref = this.$modal.open(WidgetVisibilityComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.dashboard = this.dashboard
    ref.componentInstance.resetLayout = this.resetLayout.bind(this)
    ref.componentInstance.lockLayout = this.lockLayout.bind(this)
    ref.componentInstance.unlockLayout = this.unlockLayout.bind(this)

    ref.result
      .then(widget => {
        const index = this.dashboard.findIndex((x: any) => x.component === widget.component)
        if (index > -1) {
          this.dashboard.splice(index, 1)
          this.gridChangedEvent()
          return
        }

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

        this.dashboard.push(item)

        if (widget.requiresConfig) {
          this.manageWidget(item)
        }

        setTimeout(() => {
          const widgetElement = document.getElementById(widget.component)
          if (widgetElement) widgetElement.scrollIntoView()
        }, 500)
      })
      .catch(() => { })
      .then(() => {
        this.sanitizeDashboard()
        this.syncReorderState()
      })
  }

  private getWidgetDisplayName(component: string): string {
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
      case 'HomebridgeLogsWidgetComponent':
        return this.$translate.instant('status.widget.homebridge_logs')
      case 'TerminalWidgetComponent':
        return `Homebridge ${this.$translate.instant('menu.docker.terminal')}`
      case 'ClockWidgetComponent':
        return this.$translate.instant('status.widget.clock')
      default: {
        const base = (component || '')
          .replace(/WidgetComponent$/, '')
          .replace(/Component$/, '')
          .replace(/Widget$/, '')
        const pretty = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim()
        return pretty || component
      }
    }
  }

  public getWidgetSettingsAriaLabel(item: { component?: string }): string {
    const name = this.getWidgetDisplayName(item?.component || '')
    return `${name} settings`
  }

  public manageWidget(item: Widget) {
    const ref = this.$modal.open(WidgetControlComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.widget = item
    ref.result
      .then(() => {
        this.gridChangedEvent()
        item.$configureEvent.next()
      })
      .catch(() => { })
  }

  public openCreditsModal() {
    this.$modal.open(CreditsComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public ngOnDestroy() {
    this.clearReorderAnnounceTimer()
    this.io.end()
    this.saveWidgetsEvent.complete()
  }

  private getLayout() {
    this.io.request('get-dashboard-layout').subscribe((layout) => {
      if (!layout.length) {
        return this.resetLayout()
      }

      let saveNeeded = false
      this.setLayout(layout.map((item: GridsterItem) => {
        if ((item as any).component === 'HomebridgeStatusWidgetComponent') {
          ;(item as any).component = 'UpdateInfoWidgetComponent'
          saveNeeded = true
        } else if ((item as any).component === 'ChildBridgeWidgetComponent') {
          ;(item as any).component = 'BridgesWidgetComponent'
          saveNeeded = true
        }

        if ((item as any).component === 'TerminalWidgetComponent' && !this.isAdmin) {
          return null
        }

        if (!AVAILABLE_WIDGETS.includes((item as any).component)) {
          return null
        }

        if ((item as any).component === 'AccessoriesWidgetComponent' && !this.$settings.env.enableAccessories) {
          return null
        }

        return item
      }).filter(Boolean))

      this.sanitizeDashboard()
      this.syncReorderState()

      if (saveNeeded) {
        this.gridChangedEvent()
      }
    })
  }

  private setLayout(layout: GridsterItem[]) {
    this.dashboard = layout.map((item: any) => {
      item.$resizeEvent = item.$resizeEvent || new Subject()
      item.$configureEvent = item.$configureEvent || new Subject()
      item.$saveWidgetsEvent = this.saveWidgetsEvent
      item.draggable = this.options.draggable.enabled
      return item
    })

    this.sanitizeDashboard()
    this.syncReorderState()
  }

  private resetLayout() {
    // eslint-disable-next-line ts/no-require-imports
    this.setLayout(require('./default-dashboard-layout.json'))
    this.gridChangedEvent()
  }

  private gridResizeEvent(_item: GridsterItem, itemComponent: any) {
    itemComponent.item.$resizeEvent.next('resize')
    this.page.mobile = (window.innerWidth < 1024)
    this.page.showWidgetConfigure = (window.innerWidth < 576)
  }

  private async gridChangedEvent() {
    this.dashboard.sort((a: any, b: any) => (a.mobileOrder ?? 0) - (b.mobileOrder ?? 0))

    const layout = this.dashboard.map((item: any) => {
      const { $resizeEvent, $configureEvent, $saveWidgetsEvent, ...cleanItem } = item
      return cleanItem
    })

    try {
      await firstValueFrom(this.io.request('set-dashboard-layout', layout))
    } catch (e) {
      console.error('Failed to save dashboard layout')
      console.error(e)
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    // When reorder mode is active, trap Tab navigation to prevent accidentally tabbing out of widget selection
    if (this.reorderMode && event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      
      // Forward to the reorder keyboard handler to move between widgets
      this.selectNext(event.shiftKey)
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    const hasTerminalWidget = this.dashboard.some((item: any) => item.component === 'TerminalWidgetComponent')
    if (hasTerminalWidget) {
      return this.$navigationGuard.handleBeforeUnload(event)
    }
    return undefined
  }

  public canDeactivate(): Promise<boolean> | boolean {
    const hasTerminalWidget = this.dashboard.some((item: any) => item.component === 'TerminalWidgetComponent')
    if (!hasTerminalWidget) {
      return true
    }
    return this.$navigationGuard.canDeactivate()
  }
}
