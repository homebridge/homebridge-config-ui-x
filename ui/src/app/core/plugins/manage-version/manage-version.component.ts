import type { VersionData } from '@/app/core/plugins/manage-plugins.interfaces'

import { Component, inject, OnInit, signal } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { debounceTime } from 'rxjs/operators'
import { rcompare } from 'semver'

import { ApiService } from '@/app/core/communication/api.service'
import { MANAGE_VERSION_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  templateUrl: './manage-version.component.html',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    ReactiveFormsModule,
  ],
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

  // Signals
  private _versionSelect = signal<string>('')
  public loading = signal(true)
  public versions = signal<Array<VersionData>>([])
  public versionsWithTags = signal<Array<{ version: string, tag: string }>>([])

  // Getter/setter for ngModel binding
  get versionSelect(): string {
    return this._versionSelect()
  }

  set versionSelect(value: string) {
    this._versionSelect.set(value)
  }

  // Other properties
  public isUpdateHidden = signal(false)
  public hideUpdatesFormControl = new FormControl<boolean>(false)

  // Lifecycle
  public ngOnInit(): void {
    const plugin = this.plugin
    if (!plugin) {
      return
    }
    this.versionSelect = plugin.installedVersion || plugin.latestVersion
    void this.lookupVersions()

    this.isUpdateHidden.set(this.$settings.env.plugins.hideUpdatesFor && this.$settings.env.plugins.hideUpdatesFor.includes(plugin.name))
    this.hideUpdatesFormControl.patchValue(this.isUpdateHidden())
    this.hideUpdatesFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: boolean | null) => {
        if (value !== null) {
          void this.toggleHideUpdates(value)
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

  public async toggleHideUpdates(value: boolean): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }
    let currentSetting = this.$settings.env.plugins?.hideUpdatesFor || []
    if (value) {
      if (!currentSetting.includes(plugin.name)) {
        currentSetting = [...currentSetting, plugin.name].sort((a, b) => a.localeCompare(b))
      }
    } else {
      currentSetting = currentSetting.filter(x => x !== plugin.name)
    }
    try {
      await this.$api.put('/config-editor/ui/plugins/hide-updates-for', {
        body: currentSetting,
      })

      // Trigger refresh of the plugin list in the background
      this.$settings.setEnvItem('plugins.hideUpdatesFor', currentSetting)
      const onRefresh = this.onRefreshPluginList
      if (onRefresh) {
        onRefresh()
      }
    } catch (error) {
      this.hideUpdatesFormControl.patchValue(this.isUpdateHidden(), { emitEvent: false })
      console.error(error)
      const message = error instanceof Error ? error.message : this.$translate.instant('toast.title_error')
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
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
