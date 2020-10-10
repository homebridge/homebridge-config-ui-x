import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { ApiService } from '@/app/core/api.service';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-select-previous-version',
  templateUrl: './select-previous-version.component.html',
  styleUrls: ['./select-previous-version.component.scss'],
})
export class SelectPreviousVersionComponent implements OnInit {
  @Input() plugin;

  public loading = true;
  public versions: Array<{ name: string, version: string }> = [];
  public selectedVersion: string;

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) { }

  ngOnInit(): void {
    this.selectedVersion = this.plugin.installedVersion || this.plugin.latestVersion;
    this.lookupVersions();
  }

  lookupVersions() {
    this.$api.get(`/plugins/lookup/${encodeURIComponent(this.plugin.name)}/versions`).subscribe(
      (result) => {
        const tagVersions = {};
        for (const key of Object.keys(result.tags)) {
          tagVersions[result.tags[key]] = key;
        }

        const versions = result.versions.filter(x => {
          return tagVersions[x] || !x.includes('-');
        }).reverse();

        for (const version of versions.slice(0, 20)) {
          this.versions.push({
            name: 'v' + version + (tagVersions[version] ? ' - ' + tagVersions[version] : ''),
            version: version,
          });
        }

        if (!this.versions.find((x) => x.version === this.selectedVersion) && result.tags.latest) {
          this.selectedVersion = result.tags.latest;
        }

        this.loading = false;
      },
      (err) => {
        this.$toastr.error(`${err.error.message || err.message}`, this.$translate.instant('toast.title_error'));
        this.activeModal.dismiss();
      },
    );
  }

  doInstall() {
    this.activeModal.close(this.selectedVersion);
  }

}
