import type { VersionData } from '@/app/core/plugins/manage-plugins.interfaces'

import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { debounceTime } from 'rxjs/operators'
import { rcompare } from 'semver'

import { ApiService } from '@/app/core/communication/api.service'
import { MANAGE_VERSION_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { HomebridgeUpdatePolicy } from '@/app/core/settings.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-manage-version',
  imports: [
    FormsModule,
    TranslatePipe,
    ReactiveFormsModule,
  ],
  standalone: true,
  templateUrl: './manage-version.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageVersionComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(MANAGE_VERSION_MODAL_DATA)

  // Public properties for component use
  public plugin = this.modalData.plugin
  public onRefreshPluginList = this.modalData.onRefreshPluginList
  public onSettingsChange = this.modalData.onSettingsChange

  // Signals
  private readonly _versionSelect = signal<string>('')
  public readonly loading = signal(true)
  public readonly versions = signal<Array<VersionData>>([])
  public readonly versionsWithTags = signal<Array<{ version: string, tag: string }>>([])

  // Getter/setter for ngModel binding
  get versionSelect(): string {
    return this._versionSelect()
  }

  set versionSelect(value: string) {
    this._versionSelect.set(value)
  }

  // Update preference control
  public updatePreferenceControl = new FormControl<HomebridgeUpdatePolicy>('all')

  // Lifecycle
  public ngOnInit(): void {
    const plugin = this.plugin
    if (!plugin) {
      return
    }
    this.versionSelect = plugin.installedVersion || plugin.latestVersion
    void this.lookupVersions()

    // Initialize update preference based on package type
    const currentPref = this.getCurrentUpdatePreference()
    this.updatePreferenceControl.setValue(currentPref)
    this.updatePreferenceControl.valueChanges
      .pipe(debounceTime(500))
      .subscribe((value: HomebridgeUpdatePolicy | null) => {
        if (value !== null) {
          void this.updatePreference(value)
        }
      })
  }

  // Public methods
  public doInstall(selectedVersion: string): void {
    const plugin = this.plugin
    if (!plugin) {
      return
    }
    const selectedVersionData = this.versions().find(x => x.version === selectedVersion)
    this.$activeModal.close({
      name: plugin.name,
      version: selectedVersion,
      engines: selectedVersionData?.engines,
      action: plugin.installedVersion ? 'alternate' : 'install',
    })
  }

  private getCurrentUpdatePreference(): HomebridgeUpdatePolicy {
    const plugin = this.plugin
    if (!plugin) {
      return 'all'
    }

    // For Homebridge and UI, use new policy
    if (plugin.name === 'homebridge') {
      return this.$settings.env.homebridgeUpdatePolicy || 'all'
    }

    if (plugin.name === 'homebridge-config-ui-x') {
      return this.$settings.env.homebridgeUiUpdatePolicy || 'all'
    }

    // For regular plugins, use the existing 3-option system
    if (this.$settings.env.plugins?.hideUpdatesFor?.includes(plugin.name)) {
      return 'none'
    }

    if (this.$settings.env.plugins?.showBetasFor?.includes(plugin.name)) {
      return 'beta'
    }

    return 'all'
  }

  private async updatePreference(value: HomebridgeUpdatePolicy): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }

    try {
      // Update based on package type
      if (plugin.name === 'homebridge') {
        // Use new unified policy
        await this.$api.put('/config-editor/ui', {
          key: 'homebridgeUpdatePolicy',
          value,
        })
        this.$settings.env.homebridgeUpdatePolicy = value
        await this.$api.post('/plugins/clear-cache', {})
      } else if (plugin.name === 'homebridge-config-ui-x') {
        // Use new unified policy
        await this.$api.put('/config-editor/ui', {
          key: 'homebridgeUiUpdatePolicy',
          value,
        })
        this.$settings.env.homebridgeUiUpdatePolicy = value
        await this.$api.post('/plugins/clear-cache', {})
      } else {
        // Regular plugins - use existing array-based preferences (no 'major' option)
        const hideUpdates = value === 'none'
        const preferBetas = value === 'beta'
        // Regular plugins - use array-based preferences
        let hideList = this.$settings.env.plugins?.hideUpdatesFor || []
        if (hideUpdates && !hideList.includes(plugin.name)) {
          hideList = [...hideList, plugin.name].sort((a, b) => a.localeCompare(b))
        } else if (!hideUpdates) {
          hideList = hideList.filter(x => x !== plugin.name)
        }

        let betaList = this.$settings.env.plugins?.showBetasFor || []
        if (preferBetas && !betaList.includes(plugin.name)) {
          betaList = [...betaList, plugin.name].sort((a, b) => a.localeCompare(b))
        } else if (!preferBetas) {
          betaList = betaList.filter(x => x !== plugin.name)
        }

        await this.$api.put('/config-editor/ui/plugins/hide-updates-for', {
          body: hideList,
        })
        await this.$api.put('/config-editor/ui', {
          key: 'plugins.showBetasFor',
          value: betaList,
        })
        this.$settings.setEnvItem('plugins.hideUpdatesFor', hideList)
        this.$settings.setEnvItem('plugins.showBetasFor', betaList)

        // Clear cache for regular plugins too
        await this.$api.post('/plugins/clear-cache', {})
      }

      // Trigger refreshes
      const onRefresh = this.onRefreshPluginList
      if (onRefresh) {
        onRefresh()
      }
      const onSettings = this.onSettingsChange
      if (onSettings) {
        onSettings()
      }

      // Show success toast
      this.$toastr.success(
        this.$translate.instant('config.config_saved'),
        this.$translate.instant('toast.title_success'),
      )
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : this.$translate.instant('toast.title_error')
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
      // Revert on error
      this.updatePreferenceControl.setValue(this.getCurrentUpdatePreference(), { emitEvent: false })
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  // Private methods
  private async lookupVersions(): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }
    try {
      const result: { versions: { [key: string]: VersionData }, tags: { [key: string]: string } } = await this.$api.get(`/plugins/lookup/${encodeURIComponent(plugin.name)}/versions`)
      const newVersions: Array<VersionData> = []
      const newVersionsWithTags: Array<{ version: string, tag: string }> = []

      for (const [version, data] of Object.entries(result.versions)) {
        newVersions.push({
          version,
          engines: data.engines || null,
        })

        // A version is not limited to just one tag, so we need to check all tags
        Object.keys(result.tags)
          .filter(key => result.tags[key] === version)
          .forEach((tag) => {
            newVersionsWithTags.push({
              version,
              tag,
            })
          })
      }

      const currentPlugin = this.plugin

      // In the case the plugin has an installed version that is not in the versions list, add it
      if (currentPlugin?.installedVersion && !newVersions.find(x => x.version === currentPlugin.installedVersion)) {
        newVersions.push({
          version: currentPlugin.installedVersion,
          engines: currentPlugin.engines || null,
        })
      }

      // Sort the versions array
      newVersions.sort((a, b) => rcompare(a.version, b.version))

      // Sort the versionsWithTags by tag, with ordering latest, next, beta, alpha, any other
      newVersionsWithTags.sort((a, b) => {
        const order = ['latest', 'next', 'beta', 'alpha']
        const aOrder = !order.includes(a.tag) ? 999 : order.indexOf(a.tag)
        const bOrder = !order.includes(b.tag) ? 999 : order.indexOf(b.tag)
        return aOrder - bOrder
      })

      // Update signals with new arrays
      this.versions.set(newVersions)
      this.versionsWithTags.set(newVersionsWithTags)

      if (!newVersions.find(x => x.version === this.versionSelect) && result.tags.latest) {
        this.versionSelect = result.tags.latest
      }

      this.loading.set(false)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? (error as any).error?.message || error.message : this.$translate.instant('toast.title_error')
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
      this.$activeModal.dismiss()
    }
  }
}
