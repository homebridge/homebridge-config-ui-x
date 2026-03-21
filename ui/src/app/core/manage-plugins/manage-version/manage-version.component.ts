import type { VersionData } from '@/app/core/manage-plugins/manage-plugins.interfaces'

import { Component, inject, Input, OnInit } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { debounceTime } from 'rxjs/operators'
import { rcompare } from 'semver'

import { ApiService } from '@/app/core/api.service'
import { Plugin } from '@/app/core/manage-plugins/manage-plugins.interfaces'
import { HomebridgeUpdatePolicy } from '@/app/core/settings.interfaces'
import { SettingsService } from '@/app/core/settings.service'

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
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() plugin: Plugin
  @Input() onRefreshPluginList: () => void
  @Input() onSettingsChange?: () => void

  public updatePreferenceControl = new FormControl<HomebridgeUpdatePolicy>('all')
  public loading = true
  public versions: Array<VersionData> = []
  public versionsWithTags: Array<{ version: string, tag: string }> = []
  public versionSelect: string

  public ngOnInit(): void {
    this.versionSelect = this.plugin.installedVersion || this.plugin.latestVersion
    this.lookupVersions()

    // Initialize update preference based on package type
    const currentPref = this.getCurrentUpdatePreference()
    this.updatePreferenceControl.setValue(currentPref)
    this.updatePreferenceControl.valueChanges
      .pipe(debounceTime(500))
      .subscribe((value: HomebridgeUpdatePolicy) => this.updatePreference(value))
  }

  private getCurrentUpdatePreference(): HomebridgeUpdatePolicy {
    // For Homebridge and UI, use new policy
    if (this.plugin.name === 'homebridge') {
      return this.$settings.env.homebridgeUpdatePolicy || 'all'
    }

    if (this.plugin.name === 'homebridge-config-ui-x') {
      return this.$settings.env.homebridgeUiUpdatePolicy || 'all'
    }

    // For regular plugins, use the existing 3-option system
    if (this.$settings.env.plugins?.hideUpdatesFor?.includes(this.plugin.name)) {
      return 'none'
    }

    if (this.$settings.env.plugins?.showBetasFor?.includes(this.plugin.name)) {
      return 'beta'
    }

    return 'all'
  }

  public selectUpdatePreference(value: HomebridgeUpdatePolicy) {
    this.updatePreferenceControl.setValue(value)
  }

  public doInstall(selectedVersion: string) {
    this.$activeModal.close({
      name: this.plugin.name,
      version: selectedVersion,
      engines: this.versions.find(x => x.version === selectedVersion).engines,
      action: this.plugin.installedVersion ? 'alternate' : 'install',
    })
  }

  private async updatePreference(value: HomebridgeUpdatePolicy) {
    try {
      // Update based on package type
      if (this.plugin.name === 'homebridge') {
        // Use new unified policy
        await firstValueFrom(this.$api.put('/config-editor/ui', {
          key: 'homebridgeUpdatePolicy',
          value,
        }))
        this.$settings.env.homebridgeUpdatePolicy = value
        await firstValueFrom(this.$api.post('/plugins/clear-cache', {}))
      } else if (this.plugin.name === 'homebridge-config-ui-x') {
        // Use new unified policy
        await firstValueFrom(this.$api.put('/config-editor/ui', {
          key: 'homebridgeUiUpdatePolicy',
          value,
        }))
        this.$settings.env.homebridgeUiUpdatePolicy = value
        await firstValueFrom(this.$api.post('/plugins/clear-cache', {}))
      } else {
        // Regular plugins - use existing array-based preferences (no 'major' option)
        const hideUpdates = value === 'none'
        const preferBetas = value === 'beta'
        // Regular plugins - use array-based preferences
        let hideList = this.$settings.env.plugins?.hideUpdatesFor || []
        if (hideUpdates && !hideList.includes(this.plugin.name)) {
          hideList = [...hideList, this.plugin.name].sort((a, b) => a.localeCompare(b))
        } else if (!hideUpdates) {
          hideList = hideList.filter(x => x !== this.plugin.name)
        }

        let betaList = this.$settings.env.plugins?.showBetasFor || []
        if (preferBetas && !betaList.includes(this.plugin.name)) {
          betaList = [...betaList, this.plugin.name].sort((a, b) => a.localeCompare(b))
        } else if (!preferBetas) {
          betaList = betaList.filter(x => x !== this.plugin.name)
        }

        await firstValueFrom(this.$api.put('/config-editor/ui/plugins/hide-updates-for', {
          body: hideList,
        }))
        await firstValueFrom(this.$api.put('/config-editor/ui', {
          key: 'plugins.showBetasFor',
          value: betaList,
        }))
        this.$settings.setEnvItem('plugins.hideUpdatesFor', hideList)
        this.$settings.setEnvItem('plugins.showBetasFor', betaList)

        // Clear cache for regular plugins too
        await firstValueFrom(this.$api.post('/plugins/clear-cache', {}))
      }

      // Trigger refreshes
      if (this.onRefreshPluginList) {
        this.onRefreshPluginList()
      }
      if (this.onSettingsChange) {
        this.onSettingsChange()
      }

      // Show success toast
      this.$toastr.success(
        this.$translate.instant('config.config_saved'),
        this.$translate.instant('toast.title_success'),
      )
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      // Revert on error
      this.updatePreferenceControl.setValue(this.getCurrentUpdatePreference(), { emitEvent: false })
    }
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private lookupVersions() {
    this.$api.get(`/plugins/lookup/${encodeURIComponent(this.plugin.name)}/versions`).subscribe({
      next: (result: { versions: { [key: string]: VersionData }, tags: { [key: string]: string } }) => {
        for (const [version, data] of Object.entries(result.versions)) {
          this.versions.push({
            version,
            engines: data.engines || null,
          })

          // A version is not limited to just one tag, so we need to check all tags
          Object.keys(result.tags)
            .filter(key => result.tags[key] === version)
            .forEach((tag) => {
              this.versionsWithTags.push({
                version,
                tag,
              })
            })
        }

        // In the case the plugin has an installed version that is not in the versions list, add it
        if (this.plugin.installedVersion && !this.versions.some(x => x.version === this.plugin.installedVersion)) {
          this.versions.push({
            version: this.plugin.installedVersion,
            engines: this.plugin.engines || null,
          })
        }

        // Sort the versions array
        this.versions.sort((a, b) => rcompare(a.version, b.version))

        // Sort the versionsWithTags by tag, with ordering latest, next, beta, alpha, any other
        this.versionsWithTags.sort((a, b) => {
          const order = ['latest', 'next', 'beta', 'alpha']
          const aOrder = !order.includes(a.tag) ? 999 : order.indexOf(a.tag)
          const bOrder = !order.includes(b.tag) ? 999 : order.indexOf(b.tag)
          return aOrder - bOrder
        })

        if (!this.versions.some(x => x.version === this.versionSelect) && result.tags.latest) {
          this.versionSelect = result.tags.latest
        }

        this.loading = false
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.error?.message || error.message, this.$translate.instant('toast.title_error'))
        this.$activeModal.dismiss()
      },
    })
  }
}
