import { Component, inject, Input, OnInit } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { NgxMdModule } from 'ngx-md'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'
import { satisfies } from 'semver'

import { ApiService } from '@/app/core/api.service'
import { Plugin } from '@/app/core/manage-plugins/manage-plugins.interfaces'
import { SettingsService } from '@/app/core/settings.service'
import { PluginNodeCheck } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './node-version-modal.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
    NgxMdModule,
    ReactiveFormsModule,
  ],
})
export class NodeVersionModalComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() nodeVersion: string
  @Input() latestVersion: string
  @Input() showNodeUnsupportedWarning: boolean
  @Input() homebridgeRunningInSynologyPackage: boolean
  @Input() homebridgeRunningInDocker: boolean
  @Input() homebridgePkg: Plugin
  @Input() architecture: string
  @Input() supportsNodeJs24: boolean
  @Input() onUpdate?: () => void
  @Input() statusIo?: any

  public loading = true
  public installedPlugins: PluginNodeCheck[] = []
  public nodeUpdatePolicyControl = new FormControl<'all' | 'none' | 'major'>('all')

  public async ngOnInit() {
    // Initialize the node update policy value
    this.nodeUpdatePolicyControl.setValue(this.$settings.env.nodeUpdatePolicy || 'all')

    // Watch for changes and update the backend
    this.nodeUpdatePolicyControl.valueChanges
      .pipe(debounceTime(500), distinctUntilChanged())
      .subscribe(value => this.updateNodeUpdatePolicy(value))

    await this.loadInstalledPlugins()
    this.loading = false
  }

  public selectPolicy(value: 'all' | 'none' | 'major') {
    this.nodeUpdatePolicyControl.setValue(value)
  }

  public async updateNodeUpdatePolicy(value: 'all' | 'none' | 'major') {
    try {
      await firstValueFrom(this.$api.put('/config-editor/ui', {
        key: 'nodeUpdatePolicy',
        value,
      }))

      // Update the local settings cache
      this.$settings.env.nodeUpdatePolicy = value

      // Clear the backend cache so the new policy is applied
      if (this.statusIo) {
        await firstValueFrom(this.statusIo.request('clear-nodejs-version-cache'))
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

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private async loadInstalledPlugins() {
    this.installedPlugins = []

    try {
      const installedPlugins = await firstValueFrom(this.$api.get('/plugins'))
      this.installedPlugins = installedPlugins
        .map((x: any) => {
          const isSupported = x.engines?.node
            ? (satisfies(this.latestVersion, x.engines.node, { includePrerelease: true }) ? 'yes' : 'no')
            : 'unknown'

          return {
            displayName: x.displayName || x.name,
            name: x.name,
            isSupported,
            isSupportedStr: `status.widget.update_node_${isSupported}`,
          }
        })
        .sort((a, b) => {
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
      this.installedPlugins.unshift({
        displayName: 'Homebridge',
        name: 'homebridge',
        isSupported: hbIsSupported,
        isSupportedStr: `status.widget.update_node_${hbIsSupported}`,
      })
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.toast_failed_to_load_plugins'), this.$translate.instant('toast.title_error'))
    }
  }
}
