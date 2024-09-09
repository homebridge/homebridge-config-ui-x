import { ApiService } from '@/app/core/api.service'
import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { rcompare } from 'semver'

interface VersionData {
  version: string
  engines?: {
    homebridge: string
    node: string
  }
}

@Component({
  templateUrl: './manage-version.component.html',
})
export class ManageVersionComponent implements OnInit {
  @Input() plugin: any

  public loading = true
  public versions: Array<VersionData> = []
  public versionsWithTags: Array<{ version: string, tag: string }> = []
  public versionSelect: string

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.versionSelect = this.plugin.installedVersion || this.plugin.latestVersion
    this.lookupVersions()
  }

  lookupVersions() {
    this.$api.get(`/plugins/lookup/${encodeURIComponent(this.plugin.name)}/versions`).subscribe(
      (result: { versions: { [key: string]: VersionData }, tags: { [key: string]: string } }) => {
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
      (err) => {
        this.$toastr.error(`${err.error.message || err.message}`, this.$translate.instant('toast.title_error'))
        this.activeModal.dismiss()
      },
    )
  }

  doInstall(selectedVersion: string) {
    this.activeModal.close({
      name: this.plugin.name,
      version: selectedVersion,
      engines: this.versions.find(x => x.version === selectedVersion).engines,
      action: this.plugin.installedVersion ? 'alternate' : 'install',
    })
  }
}
