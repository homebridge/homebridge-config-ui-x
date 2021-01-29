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
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component';
import { NotificationService } from '@/app/core/notification.service';
import { gt } from 'semver';

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

  public canDisablePlugins = false;
  public canManageBridgeSettings = false;

  constructor(
    public $auth: AuthService,
    private $api: ApiService,
    public $plugin: ManagePluginsService,
    private $router: Router,
    private $route: ActivatedRoute,
    public $fb: FormBuilder,
    private $modal: NgbModal,
    private $toastr: ToastrService,
    private $translate: TranslateService,
    private $notification: NotificationService,
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

    // check if the homebridge version supports disabled plugins
    this.canDisablePlugins = this.$auth.env.homebridgeVersion ?
      gt(this.$auth.env.homebridgeVersion, '1.3.0-beta.46', { includePrerelease: true }) : false;

    // check if the homebridge version supports external bridges
    this.canManageBridgeSettings = this.$auth.env.homebridgeVersion ?
      gt(this.$auth.env.homebridgeVersion, '1.3.0-experimental.6', { includePrerelease: true }) : false;
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
        this.$toastr.error(
          `${this.$translate.instant('plugins.toast_failed_to_load_plugins')}: ${err.message}`,
          this.$translate.instant('toast.title_error'),
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

  disablePlugin(plugin) {
    const ref = this.$modal.open(ConfirmComponent);

    ref.componentInstance.title = `${this.$translate.instant('plugins.manage.disable')}: ${plugin.name}`;
    ref.componentInstance.message = this.$translate.instant('plugins.manage.message_confirm_disable', { pluginName: plugin.name });
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('plugins.manage.disable');
    ref.componentInstance.cancelButtonLabel = this.$translate.instant('form.button_cancel');

    ref.result.then(async () => {
      try {
        await this.$api.put(`/config-editor/plugin/${encodeURIComponent(plugin.name)}/disable`, {}).toPromise();
        plugin.disabled = true;
        this.$toastr.success(
          this.$translate.instant('plugins.settings.toast_restart_required'),
          this.$translate.instant('toast.title_success'),
        );
        this.$notification.configUpdated.next();
      } catch (err) {
        this.$toastr.error(`Failed to disable plugin: ${err.message}`, this.$translate.instant('toast.title_error'));
      }
    }).finally(() => {
      //
    });
  }

  enablePlugin(plugin) {
    const ref = this.$modal.open(ConfirmComponent);

    ref.componentInstance.title = `${this.$translate.instant('plugins.manage.enable')}: ${plugin.name}`;
    ref.componentInstance.message = this.$translate.instant('plugins.manage.message_confirm_enable', { pluginName: plugin.name });
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('plugins.manage.enable');
    ref.componentInstance.cancelButtonLabel = this.$translate.instant('form.button_cancel');

    ref.result.then(async () => {
      try {
        await this.$api.put(`/config-editor/plugin/${encodeURIComponent(plugin.name)}/enable`, {}).toPromise();
        plugin.disabled = false;
        this.$toastr.success(
          this.$translate.instant('plugins.settings.toast_restart_required'),
          this.$translate.instant('toast.title_success'),
        );
        this.$notification.configUpdated.next();
      } catch (err) {
        this.$toastr.error(`Failed to enable plugin: ${err.message}`, this.$translate.instant('toast.title_error'));
      }
    }).finally(() => {
      //
    });
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
