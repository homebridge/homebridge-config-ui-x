import { ChangeDetectionStrategy, Component, createEnvironmentInjector, EnvironmentInjector, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap/alert'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { MANAGE_PLUGIN_MODAL_DATA, UNINSTALL_PLUGIN_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ManagePluginComponent } from '@/app/core/plugins/manage-plugin/manage-plugin.component'
import { ChildBridge } from '@/app/core/plugins/manage-plugins.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './uninstall-plugin.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NgbAlert,
    TranslatePipe,
  ],
})
export class UninstallPluginComponent implements OnInit {
  // 1. Injected Dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private injector = inject(EnvironmentInjector)
  private modalData = inject(UNINSTALL_PLUGIN_MODAL_DATA)

  // 2. Public properties (from injected data)
  public plugin = this.modalData.plugin
  public childBridges: ChildBridge[] = this.modalData.childBridges ?? []
  public action = this.modalData.action ?? ''
  public keepOrphans = this.modalData.keepOrphans ?? false
  public onRefreshPluginList = this.modalData.onRefreshPluginList ?? (() => {})

  // 3. Other public properties
  public readonly keepOrphansName = `<code>${this.$translate.instant('settings.startup.keep_accessories')}</code>`
  public keepOrphansValue = `<code>false</code>`

  // 4. Signals
  public loading = signal(true)
  public uninstalling = signal(false)
  public removeConfig = signal(true)
  public removeChildBridges = signal(true)
  public hasChildBridges = signal(false)
  public isConfigured = signal(false)
  public isConfiguredDynamicPlatform = signal(false)
  public pluginType = signal<'platform' | 'accessory' | null>(null)
  public pluginAlias = signal<string | null>(null)

  // 7. Lifecycle Hooks
  public ngOnInit(): void {
    void this.initialize()
  }

  // 8. Public Methods
  public async doUninstall(): Promise<void> {
    this.uninstalling.set(true)

    // Remove the plugin config if exists and specified by the user
    if (this.removeConfig() && this.isConfigured()) {
      try {
        await this.removePluginConfig()
      } catch (error) {
        console.error(error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        this.$toastr.error(message, this.$translate.instant('toast.title_error'))
      }
    }

    // Remove the child bridges if exists and specified by the user
    if (this.hasChildBridges() && this.removeChildBridges()) {
      try {
        await Promise.all(
          this.childBridges.map(childBridge =>
            this.removeChildBridge(childBridge.username.replace(/:/g, '')),
          ),
        )
      } catch (error) {
        console.error(error)
      }
    }

    // Close the modal
    this.$activeModal.dismiss()

    // Open a new modal to finally uninstall the plugin
    if (!this.plugin) {
      return
    }

    const modalInjector = createEnvironmentInjector([{
      provide: MANAGE_PLUGIN_MODAL_DATA,
      useValue: {
        action: 'Uninstall',
        pluginName: this.plugin.name,
        pluginDisplayName: this.plugin.displayName,
        onRefreshPluginList: this.onRefreshPluginList,
      },
    }], this.injector)

    this.$modal.open(ManagePluginComponent, {
      size: 'lg',
      backdrop: 'static',
      injector: modalInjector,
    })
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  public onRemoveConfigChange(): void {
    // Always sync removeChildBridges with removeConfig since they go hand-in-hand
    this.removeChildBridges.set(this.removeConfig())
  }

  public get settingTranslationKey(): string {
    // For dynamic platforms with keepOrphans=true, show override message when removing config
    if (this.isConfiguredDynamicPlatform() && this.keepOrphans && this.removeConfig()) {
      return 'plugins.manage.confirm_disable_setting_override'
    }
    return 'plugins.manage.confirm_disable_setting'
  }

  public get shouldShowCleanupAlert(): boolean {
    // Only show cleanup alert if accessories are being removed from cache
    return !(this.keepOrphans && this.isConfiguredDynamicPlatform() && !this.removeConfig())
  }

  public get willKeepAccessoriesInCache(): boolean {
    // Accessories kept in cache only when: keepOrphans=true, dynamic platform, and NOT removing config
    return this.keepOrphans && this.isConfiguredDynamicPlatform() && !this.removeConfig()
  }

  // 9. Private Methods
  private async initialize(): Promise<void> {
    if (!this.plugin) {
      return
    }

    try {
      this.isConfigured.set(this.plugin.isConfigured)
      if (this.childBridges.length) {
        this.hasChildBridges.set(true)
      }

      const schema = await this.getAlias()
      this.pluginType.set(schema.pluginType)
      this.pluginAlias.set(schema.pluginAlias)

      // Check if this is a dynamic platform
      if (this.pluginType() === 'platform' && this.pluginAlias()) {
        this.isConfiguredDynamicPlatform.set(true)
      }

      this.keepOrphansValue = `<code>${this.keepOrphans}</code>`

      // When keepOrphans=true and dynamic platform, default to NOT removing config (keeping accessories)
      if (this.keepOrphans && this.isConfiguredDynamicPlatform()) {
        this.removeConfig.set(false)
      }

      // Always sync removeChildBridges with removeConfig on init
      this.removeChildBridges.set(this.removeConfig())
    } catch (error) {
      console.error('Failed to initialize:', error)
      const message = error instanceof Error ? error.message : 'Failed to load plugin information'
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
    } finally {
      this.loading.set(false)
    }
  }

  private async getAlias(): Promise<any> {
    if (!this.plugin) {
      throw new Error('Plugin not set')
    }
    return this.$api.get(`/plugins/alias/${encodeURIComponent(this.plugin.name)}`)
  }

  private async removePluginConfig(): Promise<void> {
    if (!this.plugin) {
      return
    }

    // Remove the config for this plugin
    await this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, [])

    // If the plugin is in the disabled list, then remove it
    await this.$api.put(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}/enable`, {})

    this.$toastr.success(
      this.$translate.instant('plugins.settings.plugin_config_saved'),
      this.$translate.instant('toast.title_success'),
    )
  }

  private async removeChildBridge(id: string): Promise<void> {
    try {
      await this.$api.delete(`/server/pairings/${id}`)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Failed to remove child bridge'
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
    }
  }
}
