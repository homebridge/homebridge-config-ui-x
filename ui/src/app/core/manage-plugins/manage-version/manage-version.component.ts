import { Component, inject, Input, OnInit } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbActiveModal, NgbAlert } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { debounceTime } from 'rxjs/operators'
import { rcompare } from 'semver'

import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'

interface VersionData {
  version: string
  engines?: {
    homebridge: string
    node: string
  }
}

@Component({
  templateUrl: './manage-version.component.html',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    NgbAlert,
    ReactiveFormsModule,
  ],
})
export class ManageVersionComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() plugin: any

  public isUpdateHidden: boolean = false
  public hideUpdatesFormControl = new FormControl(false)
  public loading = true
  public versions: Array<VersionData> = []
  public versionsWithTags: Array<{ version: string, tag: string }> = []
  public versionSelect: string

  constructor() {}

  ngOnInit(): void {
    this.versionSelect = this.plugin.installedVersion || this.plugin.latestVersion
    this.lookupVersions()

    this.isUpdateHidden = this.$settings.env.plugins.hideUpdatesFor && this.$settings.env.plugins.hideUpdatesFor.includes(this.plugin.name)
    this.hideUpdatesFormControl.patchValue(this.isUpdateHidden)
    this.hideUpdatesFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: boolean) => this.toggleHideUpdates(value))
  }

  lookupVersions() {
    this.$api.get(`/plugins/lookup/${encodeURIComponent(this.plugin.name)}/versions`).subscribe({
      next: (result: { versions: { [key: string]: VersionData }, tags: { [key: string]: string } }) => {
        const tagVersions = new Set<string>()

        for (const [version, data] of Object.entries(result.versions)) {
          this.versions.push({
            version,
            engines: data.engines || null,
          })

          const tag = Object.keys(result.tags).find(key => result.tags[key] === version)
          if (tag) {
            this.versionsWithTags.push({
              version,
              tag,
            })
            tagVersions.add(version)
          }
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

        if (!this.versions.find(x => x.version === this.versionSelect) && result.tags.latest) {
          this.versionSelect = result.tags.latest
        }

        this.loading = false
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.error.message || error.message, this.$translate.instant('toast.title_error'))
        this.$activeModal.dismiss()
      },
    })
  }

  doInstall(selectedVersion: string) {
    this.$activeModal.close({
      name: this.plugin.name,
      version: selectedVersion,
      engines: this.versions.find(x => x.version === selectedVersion).engines,
      action: this.plugin.installedVersion ? 'alternate' : 'install',
    })
  }

  async toggleHideUpdates(value: boolean) {
    let currentSetting = this.$settings.env.plugins?.hideUpdatesFor || []
    if (value) {
      if (!currentSetting.includes(this.plugin.name)) {
        currentSetting = [...currentSetting, this.plugin.name].sort((a, b) => a.localeCompare(b))
      }
    } else {
      currentSetting = currentSetting.filter(x => x !== this.plugin.name)
    }
    try {
      await firstValueFrom(this.$api.put('/config-editor/ui/plugins/hide-updates-for', {
        body: currentSetting,
      }))
      this.$settings.setEnvItem('plugins.hideUpdatesFor', currentSetting)
      window.location.href = `/plugins?action=open-manage-version&plugin=${this.plugin.name}`
    } catch (error) {
      this.hideUpdatesFormControl.patchValue(this.isUpdateHidden, { emitEvent: false })
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }
}
