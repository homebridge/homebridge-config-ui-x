import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'
import { satisfies } from 'semver'

import { ApiService } from '@/app/core/communication/api.service'
import { NODE_VERSION_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { NodeUpdatePolicy } from '@/app/core/settings.interfaces'
import { SettingsService } from '@/app/core/ui'
import { InstalledPlugin } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.interfaces'
import { PluginNodeCheck } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  selector: 'app-node-version-modal',
  imports: [
    TranslatePipe,
    ReactiveFormsModule,
  ],
  standalone: true,
  templateUrl: './node-version-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodeVersionModalComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Inject modal data
  private modalData = inject(NODE_VERSION_MODAL_DATA)

  // Public properties (from injected data)
  public nodeVersion = this.modalData.nodeVersion
  public latestVersion = this.modalData.latestVersion
  public showNodeUnsupportedWarning = this.modalData.showNodeUnsupportedWarning
  public homebridgeRunningInSynologyPackage = this.modalData.homebridgeRunningInSynologyPackage
  public homebridgeRunningInDocker = this.modalData.homebridgeRunningInDocker
  public homebridgePkg = this.modalData.homebridgePkg
  public architecture = this.modalData.architecture
  public supportsNodeJs24 = this.modalData.supportsNodeJs24
  public onUpdate = this.modalData.onUpdate
  public statusIo = this.modalData.statusIo

  // Signals
  public readonly loading = signal(true)
  public readonly installedPlugins = signal<PluginNodeCheck[]>([])

  // Other properties
  public hasNode24OrAbove = false
  public nodeUpdatePolicyControl = new FormControl<NodeUpdatePolicy>('all')
  public defaultIcon = 'assets/hb-icon.png'

  public ngOnInit(): void {
    // Initialize the node update policy value
    this.nodeUpdatePolicyControl.setValue(this.$settings.env.nodeUpdatePolicy || 'all')
    this.hasNode24OrAbove = satisfies(this.nodeVersion, '>=24.0.0', { includePrerelease: true })

    // Watch for changes and update the backend
    this.nodeUpdatePolicyControl.valueChanges
      .pipe(debounceTime(500), distinctUntilChanged())
      .subscribe(value => void this.updateNodeUpdatePolicy(value!))

    void this.initialize()
  }

  private async initialize(): Promise<void> {
    await this.loadInstalledPlugins()
    this.loading.set(false)
  }

  public async updateNodeUpdatePolicy(value: NodeUpdatePolicy): Promise<void> {
    try {
      await this.$api.put('/config-editor/ui', {
        key: 'nodeUpdatePolicy',
        value,
      })

      // Update the local settings cache
      this.$settings.env.nodeUpdatePolicy = value

      // Clear the backend cache so the new policy is applied
      if (this.statusIo) {
        await this.statusIo.request('clear-nodejs-version-cache')
      }

      // Call the onUpdate callback if provided to refresh the widget
      if (this.onUpdate) {
        await this.onUpdate()
      }

      // Show success toast
      this.$toastr.success(
        this.$translate.instant('config.config_saved'),
        this.$translate.instant('toast.title_success'),
      )
    } catch (error) {
      console.error(error)
      this.$toastr.error(
        this.$translate.instant('config.toast_failed_to_save_config'),
        this.$translate.instant('toast.title_error'),
      )
      // Revert the form control on error
      this.nodeUpdatePolicyControl.setValue(this.$settings.env.nodeUpdatePolicy || 'all', { emitEvent: false })
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  private async loadInstalledPlugins(): Promise<void> {
    this.installedPlugins.set([])

    try {
      const installedPlugins = await this.$api.get('/plugins')
      const processedPlugins = installedPlugins
        .map((x: any) => {
          const isSupported = x.engines?.node
            ? (satisfies(this.latestVersion, x.engines.node, { includePrerelease: true }) ? 'yes' : 'no')
            : 'unknown'

          return {
            displayName: x.displayName || x.name,
            name: x.name,
            isSupported,
            isSupportedStr: `status.widget.update_node_${isSupported}`,
            icon: x.icon || this.defaultIcon,
          } as PluginNodeCheck
        })
        .sort((a: InstalledPlugin, b: InstalledPlugin) => {
          if (a.name === 'homebridge-config-ui-x') {
            return -1
          }
          if (b.name === 'homebridge-config-ui-x') {
            return 1
          }
          return a.name.localeCompare(b.name)
        })

      // Insert an item for Homebridge at the beginning of the list
      const hbIsSupported = satisfies(this.latestVersion, this.homebridgePkg.engines.node, { includePrerelease: true })
        ? 'yes'
        : 'no'
      processedPlugins.unshift({
        displayName: 'Homebridge',
        name: 'homebridge',
        isSupported: hbIsSupported,
        isSupportedStr: `status.widget.update_node_${hbIsSupported}`,
        icon: this.defaultIcon,
      })

      this.installedPlugins.set(processedPlugins)
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.toast_failed_to_load_plugins'), this.$translate.instant('toast.title_error'))
    }
  }

  public handleIconError(plugin: PluginNodeCheck): void {
    plugin.icon = this.defaultIcon
  }
}
