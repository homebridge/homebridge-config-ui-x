import { DatePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, createEnvironmentInjector, effect, EnvironmentInjector, inject, input, OnInit, signal } from '@angular/core'
import { NgbDropdown, NgbDropdownButtonItem, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap/dropdown'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { PluginsCacheService } from '@/app/core/caching/plugins-cache.service'
import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { CONFIRM_MODAL_DATA, DISABLE_PLUGIN_MODAL_DATA, PLUGIN_LOGS_MODAL_DATA, PLUGIN_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { DisablePluginComponent } from '@/app/core/plugins/disable-plugin/disable-plugin.component'
import { DonateComponent } from '@/app/core/plugins/donate/donate.component'
import { ChildBridge, Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { PluginInfoComponent } from '@/app/core/plugins/plugin-info/plugin-info.component'
import { PluginLogsComponent } from '@/app/core/plugins/plugin-logs/plugin-logs.component'
import { RE_HOMEBRIDGE_PREFIX } from '@/app/core/regex.constants'
import { SettingsService } from '@/app/core/ui/settings.service'
import { MobileDetectService } from '@/app/core/utilities/mobile-detect.service'

@Component({
  selector: 'app-plugin-card',
  imports: [
    NgbTooltip,
    NgbDropdown,
    NgbDropdownToggle,
    NgbDropdownMenu,
    NgbDropdownButtonItem,
    NgbDropdownItem,
    DatePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './plugin-card.component.html',
  styleUrl: './plugin-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PluginCardComponent implements OnInit {
  // Injected dependencies
  private injector = inject(EnvironmentInjector)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $md = inject(MobileDetectService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $pluginsCache = inject(PluginsCacheService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  // Inputs
  readonly plugin = input.required<Plugin>()
  readonly childBridges = input.required<ChildBridge[]>()

  // The transport icons help someone choosing a plugin to install decide
  // between two that do the same job, so they only appear on search results.
  // On an already-installed plugin the question is settled, and the child
  // bridge rows below already say which transports it is actually using.
  readonly isSearchResult = input<boolean>(false)

  // Other properties
  private io!: IoNamespace
  public readonly defaultIcon = 'assets/hb-icon.png'
  public readonly isAdmin = this.$auth.user.admin

  // A plugin with neither supports-* keyword predates the convention and can
  // only be a HAP plugin, so the hap icon stays enabled as the fallback.
  public get supportsHap(): boolean {
    return this.plugin().supportsHap === true || this.plugin().supportsMatter !== true
  }

  public get supportsMatter(): boolean {
    return this.plugin().supportsMatter === true
  }

  // With a single transport the plugin definitely exposes over it ("exposes"),
  // with both it depends on the bridge config ("can expose"). The tooltip keys
  // are shared between the icons; the protocol name is interpolated in from
  // the label keys in the template.
  public get hapTooltip(): string {
    if (!this.supportsHap) {
      return 'plugins.tooltip_not'
    }
    return this.supportsMatter ? 'plugins.tooltip_can' : 'plugins.tooltip_yes'
  }

  public get matterTooltip(): string {
    if (!this.supportsMatter) {
      return 'plugins.tooltip_not'
    }
    return this.supportsHap ? 'plugins.tooltip_can' : 'plugins.tooltip_yes'
  }

  // Signals
  public readonly hasChildBridges = signal(false)
  public readonly allChildBridgesStopped = signal(false)
  public readonly childBridgeStatus = signal('pending')
  public readonly childBridgeRestartInProgress = signal(false)
  public readonly isMobile = signal<string>('')
  public readonly setChildBridges = signal<ChildBridge[]>([])

  constructor() {
    // Use effect to react to childBridges changes
    effect(() => {
      const childBridges = this.childBridges()
      this.hasChildBridges.set(childBridges.length > 0)
      this.allChildBridgesStopped.set(childBridges.every(x => x.manuallyStopped === true))

      if (this.hasChildBridges()) {
        // Get the "worse" status of all child bridges and use that for color icon
        if (childBridges.some(x => x.status === 'down')) {
          this.childBridgeStatus.set('down')
        } else if (childBridges.some(x => x.status === 'pending')) {
          this.childBridgeStatus.set('pending')
        } else if (childBridges.some(x => x.status === 'ok')) {
          this.childBridgeStatus.set('ok')
        }
      }

      this.setChildBridges.set(childBridges)
    })
  }

  public ngOnInit(): void {
    this.isMobile.set(this.$md.detect.mobile() || '')
    this.io = this.$ws.getExistingNamespace('child-bridges')

    if (this.isMobile() && this.plugin().displayName.toLowerCase().startsWith('homebridge ')) {
      this.plugin().displayName = this.plugin().displayName.replace(RE_HOMEBRIDGE_PREFIX, '')
    }

    if (!this.plugin().icon) {
      this.plugin().icon = this.defaultIcon
    }
  }

  public openFundingModal(plugin: Plugin) {
    const injector = createEnvironmentInjector([{
      provide: PLUGIN_MODAL_DATA,
      useValue: { plugin },
    }], this.injector)

    this.$modal.open(DonateComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
  }

  public pluginInfoModal(plugin: Plugin) {
    const injector = createEnvironmentInjector([{
      provide: PLUGIN_MODAL_DATA,
      useValue: { plugin },
    }], this.injector)

    this.$modal.open(PluginInfoComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
  }

  public async disablePlugin(plugin: Plugin): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: DISABLE_PLUGIN_MODAL_DATA,
      useValue: {
        pluginName: plugin.displayName || plugin.name,
        isConfigured: plugin.isConfigured,
        isConfiguredDynamicPlatform: plugin.isConfiguredDynamicPlatform,
        keepOrphans: this.$settings.keepOrphans,
      },
    }], this.injector)

    const ref = this.$modal.open(DisablePluginComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      try {
        // Mark as disabled
        await this.$api.put(`/config-editor/plugin/${encodeURIComponent(plugin.name)}/disable`, {})
        this.$pluginsCache.invalidate()
        plugin.disabled = true

        // Stop all child bridges
        if (this.hasChildBridges()) {
          void this.doChildBridgeAction('stop')
        }
        this.$modal.open(RestartHomebridgeComponent, {
          size: 'lg',
          backdrop: 'static',
        })
      } catch (error) {
        console.error(error)
        this.$toastr.error(this.$translate.instant('plugins.disable.error'), this.$translate.instant('toast.title_error'))
      }
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public async enablePlugin(plugin: Plugin): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: CONFIRM_MODAL_DATA,
      useValue: {
        title: plugin.name,
        message: this.$translate.instant('plugins.manage.confirm_enable', { pluginName: plugin.displayName }),
        confirmButtonLabel: this.$translate.instant('plugins.manage.enable'),
        faIconClass: 'fa-circle-play primary-text',
      },
    }], this.injector)

    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      try {
        await this.$api.put(`/config-editor/plugin/${encodeURIComponent(plugin.name)}/enable`, {})
        this.$pluginsCache.invalidate()

        // Mark as enabled
        plugin.disabled = false

        // Start all child bridges
        if (this.hasChildBridges()) {
          await this.doChildBridgeAction('start')
        }
        this.$modal.open(RestartHomebridgeComponent, {
          size: 'lg',
          backdrop: 'static',
        })
      } catch (error) {
        console.error(error)
        this.$toastr.error(this.$translate.instant('plugins.enable.error'), this.$translate.instant('toast.title_error'))
      }
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public viewPluginLog(): void {
    const injector = createEnvironmentInjector([{
      provide: PLUGIN_LOGS_MODAL_DATA,
      useValue: {
        plugin: this.plugin(),
        childBridges: this.setChildBridges(),
      },
    }], this.injector)

    this.$modal.open(PluginLogsComponent, {
      size: 'xl',
      backdrop: 'static',
      injector,
    })
  }

  public async doChildBridgeAction(action: 'stop' | 'start' | 'restart'): Promise<void> {
    this.childBridgeRestartInProgress.set(true)
    try {
      for (const bridge of this.setChildBridges()) {
        await firstValueFrom(this.io.request(`${action}-child-bridge`, bridge.username))
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.bridge.action_error', { action }), this.$translate.instant('toast.title_error'))
      this.childBridgeRestartInProgress.set(false)
    } finally {
      setTimeout(() => {
        this.childBridgeRestartInProgress.set(false)
      }, action === 'restart' ? 12000 : action === 'stop' ? 6000 : 1000)
    }
  }

  public handleIconError(): void {
    this.plugin().icon = this.defaultIcon
  }

  public checkAndUpdatePlugin(): void {
    void this.$plugin.checkAndUpdatePlugin(this.plugin(), this.plugin().latestVersion)
  }

  public openSettings(): void {
    void this.$plugin.settings(this.plugin())
  }

  public openBridgeSettings(): void {
    void this.$plugin.bridgeSettings(this.plugin())
  }

  public openExternalAccessories(): void {
    void this.$plugin.externalAccessories(this.plugin())
  }

  public switchToScoped(): void {
    void this.$plugin.switchToScoped(this.plugin())
  }

  public installAlternateVersion(): void {
    void this.$plugin.installAlternateVersion(this.plugin())
  }

  public openJsonEditor(): void {
    void this.$plugin.jsonEditor(this.plugin())
  }

  public uninstallPlugin(): void {
    this.$plugin.uninstallPlugin(this.plugin(), this.setChildBridges())
  }

  public resetChildBridges(): void {
    void this.$plugin.resetChildBridges(this.setChildBridges())
  }
}
