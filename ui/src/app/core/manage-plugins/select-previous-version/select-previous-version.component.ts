import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { rcompare } from 'semver';
import { ApiService } from '@/app/core/api.service';

@Component({
  selector: 'app-select-previous-version',
  templateUrl: './select-previous-version.component.html',
  styleUrls: ['./select-previous-version.component.scss'],
})
export class SelectPreviousVersionComponent implements OnInit {
  @Input() plugin: any;

  public loading = true;
  public versions: Array<{ version: string }> = [];
  public versionsWithTags: Array<{ version: string; tag: string }> = [];
  public versionSelect: string;

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.lookupVersions();
  }

  lookupVersions() {
    this.$api.get(`/plugins/lookup/${encodeURIComponent(this.plugin.name)}/versions`).subscribe(
      (result) => {
        const tagVersions = {};
        for (const key of Object.keys(result.tags)) {
          tagVersions[result.tags[key]] = key;
        }

        const versions = result.versions.sort(rcompare);

        for (const version of versions) {
          this.versions.push({
            version,
          });

          if (tagVersions[version]) {
            this.versionsWithTags.push({
              version,
              tag: tagVersions[version],
            });
          }
        }

        // Sort the versionsWithTags by tag, with ordering latest, next, beta, alpha, any other
        this.versionsWithTags.sort((a, b) => {
          const order = ['latest', 'next', 'beta', 'alpha'];
          const aOrder = order.indexOf(a.tag) === -1 ? 999 : order.indexOf(a.tag);
          const bOrder = order.indexOf(b.tag) === -1 ? 999 : order.indexOf(b.tag);
          return aOrder - bOrder;
        });

        this.loading = false;
      },
      (err) => {
        this.$toastr.error(`${err.error.message || err.message}`, this.$translate.instant('toast.title_error'));
        this.activeModal.dismiss();
      },
    );
  }

  doInstall(selectedVersion: string) {
    this.activeModal.close(selectedVersion);
  }
}
