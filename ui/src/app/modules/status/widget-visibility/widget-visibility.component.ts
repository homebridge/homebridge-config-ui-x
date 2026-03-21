import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'

import { WIDGET_VISIBILITY_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'

export interface WidgetVisibilityEntry {
  name: string
  component: string
  showOnDesktop: boolean
  showOnMobile: boolean
  cols: number
  rows: number
  mobileOrder: number
  hideOnDesktop: boolean
  hideOnMobile: boolean
  requiresConfig?: boolean
}

@Component({
  selector: 'app-widget-visibility',
  imports: [
    TranslatePipe,
    FormsModule,
  ],
  standalone: true,
  templateUrl: './widget-visibility.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WidgetVisibilityComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $settings = inject(SettingsService)
  private $translate = inject(TranslateService)
  private modalData = inject(WIDGET_VISIBILITY_MODAL_DATA)

  // Public properties for component use
  public dashboard = this.modalData.dashboard
  public resetLayout = this.modalData.resetLayout

  // Signals
  public readonly availableWidgets = signal<WidgetVisibilityEntry[]>([])

  // Original state for change detection
  private originalState: { showOnDesktop: boolean, showOnMobile: boolean }[] = []

  public ngOnInit(): void {
    const allWidgets = [
      {
        name: this.$translate.instant('status.services.updates'),
        component: 'UpdateInfoWidgetComponent',
        hidden: false,
        cols: 10,
        rows: 3,
        mobileOrder: 10,
      },
      {
        name: this.$translate.instant('status.widget.weather.title_weather'),
        component: 'WeatherWidgetComponent',
        hidden: false,
        cols: 3,
        rows: 5,
        mobileOrder: 20,
        requiresConfig: true,
      },
      {
        name: this.$translate.instant('menu.label_accessories'),
        component: 'AccessoriesWidgetComponent',
        hidden: !this.$settings.env.enableAccessories,
        cols: 7,
        rows: 9,
        mobileOrder: 30,
      },
      {
        name: this.$translate.instant('child_bridge.bridges'),
        component: 'BridgesWidgetComponent',
        hidden: false,
        cols: 5,
        rows: 9,
        mobileOrder: 35,
      },
      {
        name: this.$translate.instant('status.cpu.title_cpu'),
        component: 'CpuWidgetComponent',
        hidden: false,
        cols: 5,
        rows: 3,
        mobileOrder: 40,
      },
      {
        name: this.$translate.instant('status.memory.title_memory'),
        component: 'MemoryWidgetComponent',
        hidden: false,
        cols: 5,
        rows: 3,
        mobileOrder: 50,
      },
      {
        name: this.$translate.instant('status.network.title_network'),
        component: 'NetworkWidgetComponent',
        hidden: false,
        cols: 10,
        rows: 3,
        mobileOrder: 55,
      },
      {
        name: this.$translate.instant('status.uptime.title_uptime'),
        component: 'UptimeWidgetComponent',
        hidden: false,
        cols: 5,
        rows: 3,
        mobileOrder: 60,
      },
      {
        name: this.$translate.instant('status.widget.info'),
        component: 'SystemInfoWidgetComponent',
        hidden: false,
        cols: 5,
        rows: 9,
        mobileOrder: 70,
      },
      {
        name: this.$translate.instant('status.widget.add.label_pairing_code'),
        component: 'HapQrcodeWidgetComponent',
        hidden: false,
        cols: 3,
        rows: 7,
        mobileOrder: 100,
      },
      ...this.$settings.isFeatureEnabled('matterSupport')
        ? [{
            name: this.$translate.instant('status.widget.add.matter_pairing_code'),
            component: 'MatterQrcodeWidgetComponent',
            hidden: false,
            cols: 3,
            rows: 7,
            mobileOrder: 105,
          }]
        : [],
      {
        name: this.$translate.instant('status.widget.homebridge_logs'),
        component: 'HomebridgeLogsWidgetComponent',
        hidden: false,
        cols: 7,
        rows: 6,
        mobileOrder: 1000,
      },
      {
        name: `Homebridge ${this.$translate.instant('menu.docker.terminal')}`,
        component: 'TerminalWidgetComponent',
        hidden: !this.$settings.env.enableTerminalAccess,
        cols: 7,
        rows: 6,
        mobileOrder: 1000,
      },
      {
        name: this.$translate.instant('status.widget.clock'),
        component: 'ClockWidgetComponent',
        cols: 5,
        rows: 3,
        mobileOrder: 23,
      },
    ]

    const entries: WidgetVisibilityEntry[] = allWidgets
      .filter(x => !x.hidden)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => {
        const dashboardItem = this.dashboard.find((i: any) => i.component === x.component)
        const isInDashboard = !!dashboardItem
        const hideOnDesktop = isInDashboard ? (dashboardItem.hideOnDesktop ?? false) : true
        const hideOnMobile = isInDashboard ? (dashboardItem.hideOnMobile ?? false) : true
        return {
          name: x.name,
          component: x.component,
          showOnDesktop: !hideOnDesktop,
          showOnMobile: !hideOnMobile,
          cols: x.cols,
          rows: x.rows,
          mobileOrder: x.mobileOrder,
          hideOnDesktop,
          hideOnMobile,
          requiresConfig: x.requiresConfig,
        }
      })

    this.availableWidgets.set(entries)
    this.originalState = entries.map(e => ({ showOnDesktop: e.showOnDesktop, showOnMobile: e.showOnMobile }))
  }

  public toggleDesktop(widget: WidgetVisibilityEntry): void {
    const widgets = this.availableWidgets()
    const index = widgets.findIndex(w => w.component === widget.component)
    const updated = [...widgets]
    updated[index] = { ...updated[index], showOnDesktop: !updated[index].showOnDesktop }
    this.availableWidgets.set(updated)
  }

  public toggleMobile(widget: WidgetVisibilityEntry): void {
    const widgets = this.availableWidgets()
    const index = widgets.findIndex(w => w.component === widget.component)
    const updated = [...widgets]
    updated[index] = { ...updated[index], showOnMobile: !updated[index].showOnMobile }
    this.availableWidgets.set(updated)
  }

  public readonly isFormUnchanged = computed(() => {
    const current = this.availableWidgets()
    return current.every((w, i) =>
      w.showOnDesktop === this.originalState[i].showOnDesktop
      && w.showOnMobile === this.originalState[i].showOnMobile,
    )
  })

  public saveModal(): void {
    const result = this.availableWidgets().map(w => ({
      ...w,
      hideOnDesktop: !w.showOnDesktop,
      hideOnMobile: !w.showOnMobile,
    }))
    this.$activeModal.close(result)
  }

  public doResetLayout(): void {
    this.resetLayout()
    this.$activeModal.dismiss()
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
