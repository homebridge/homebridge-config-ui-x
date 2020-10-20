import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs/operators';

import { AuthService } from '@/app/core/auth/auth.service';
import { ApiService } from '@/app/core/api.service';
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service';
import { DonateModalComponent } from '../donate-modal/donate-modal.component';

@Component({
  selector: 'app-plugins',
  templateUrl: '../plugins.component.html',
  styleUrls: ['../plugins.component.scss'],
})
export class InstalledPluginsComponent implements OnInit, OnDestroy {
  public form: FormGroup;
  public installedPlugins: any = [];
  public loading = true;
  public searchQuery: string;
  private navigationSubscription;

  constructor(
    public $auth: AuthService,
    private $api: ApiService,
    public $plugin: ManagePluginsService,
    private $router: Router,
    private $route: ActivatedRoute,
    public $fb: FormBuilder,
    private $modal: NgbModal,
    private toastr: ToastrService,
    private translate: TranslateService,
  ) { }

  ngOnInit() {
    this.navigationSubscription = this.$router.events.subscribe((e: any) => {
      // If it is a NavigationEnd event re-initalise the component
      if (e instanceof NavigationEnd) {
        this.loadInstalledPlugins();
      }
    });

    this.form = this.$fb.group({
      query: ['', Validators.required],
    });

    // load list of installed plugins
    this.loadInstalledPlugins();
  }

  loadInstalledPlugins() {
    this.installedPlugins = [];
    this.loading = true;
    this.$api.get(`/plugins`).subscribe(
      (data: any) => {
        this.installedPlugins = data;
        this.loading = false;
        this.checkRecentlyInstalled();
      },
      (err) => {
        this.toastr.error(
          `${this.translate.instant('plugins.toast_failed_to_load_plugins')}: ${err.message}`,
          this.translate.instant('toast.title_error'),
        );
      },
    );
  }

  checkRecentlyInstalled() {
    this.$route.queryParams.pipe(take(1)).subscribe(async (params) => {
      if (params.installed && this.installedPlugins.find(x => x.name === params.installed && x.settingsSchema)) {
        this.$plugin.settings(this.installedPlugins.find(x => x.name === params.installed))
          .finally(() => {
            this.$router.navigate(['/plugins']);
          });
      }
    });
  }

  openFundingModal(plugin) {
    const ref = this.$modal.open(DonateModalComponent);
    ref.componentInstance.plugin = plugin;
  }

  onClearSearch() {
    this.form.setValue({ query: '' });
  }

  onSubmit({ value, valid }) {
    this.$router.navigate(['/plugins/search', value.query]);
  }

  ngOnDestroy() {
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe();
    }
  }

}
