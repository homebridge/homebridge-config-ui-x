import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { ApiService } from '@/app/core/api.service';
import { SettingsService } from '@/app/core/settings.service';
import { IoNamespace, WsService } from '@/app/core/ws.service';

@Component({
  selector: 'app-plugins',
  templateUrl: './plugins.component.html',
  styleUrls: ['./plugins.component.scss'],
})
export class PluginsComponent implements OnInit, OnDestroy {
  public loading = true;
  public installedPlugins: any = [];
  public childBridges = [];
  public form = new FormGroup({
    query: new FormControl('', [Validators.required]),
  });

  private io: IoNamespace;
  private navigationSubscription: Subscription;

  constructor(
    private $api: ApiService,
    private $ws: WsService,
    private $router: Router,
    private $settings: SettingsService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  async ngOnInit() {
    this.io = this.$ws.connectToNamespace('child-bridges');
    this.io.connected.subscribe(async () => {
      this.getChildBridgeMetadata();
      this.io.socket.emit('monitor-child-bridge-status');
    });

    this.io.socket.on('child-bridge-status-update', (data) => {
      const existingBridge = this.childBridges.find(x => x.username === data.username);
      if (existingBridge) {
        Object.assign(existingBridge, data);
      } else {
        this.childBridges.push(data);
      }
    });

    this.navigationSubscription = this.$router.events.subscribe((e: any) => {
      // If it is a NavigationEnd event re-initialise the component
      if (e instanceof NavigationEnd) {
        this.loadInstalledPlugins();
      }
    });

    // load list of installed plugins
    await this.loadInstalledPlugins();
  }

  async loadInstalledPlugins() {
    this.form.setValue({ query: '' });

    this.installedPlugins = [];
    this.loading = true;

    try {
      this.installedPlugins = await this.$api.get('/plugins').toPromise();
      await this.appendMetaInfo();
      this.loading = false;

      // The backend used to sort this only by plugins with updates first
      // I removed this sorting since now we want the frontend to do more of the work
      // We have more things that we want to bring to the top of the list
      return this.installedPlugins
        // plugins with updates should appear first
        .sort((a) => (a.updateAvailable ? -1 : 1))
        // then plugins which have not been configured
        .sort((a, b) => (a.isConfigured && !b.isConfigured ? 1 : -1))
        // then plugins which have child bridges which are not paired
        .sort((a, b) => (a.hasChildBridgesUnpaired && !b.hasChildBridgesUnpaired ? -1 : 1))
        // then plugins which do not have child bridges, but child bridges are recommended via the settings
        .sort((a, b) => (a.hasChildBridges && !b.hasChildBridges && this.$settings.env.recommendChildBridges ? -1 : 1))
        // finally just sort alphabetically
        .sort((a, b) => (a.displayName > b.displayName ? 1 : -1));
    } catch (err) {
      this.$toastr.error(
        `${this.$translate.instant('plugins.toast_failed_to_load_plugins')}: ${err.message}`,
        this.$translate.instant('toast.title_error'),
      );
    }
  }

  async appendMetaInfo() {
    // Also get the current configuration for each plugin
    await Promise.all(
      this.installedPlugins
        .filter((plugin) => plugin.installedVersion)
        .map(async (plugin) => {
          try {
            const configBlocks = await this.$api.get(`/config-editor/plugin/${encodeURIComponent(plugin.name)}`).toPromise();
            const childBridges = this.getPluginChildBridges(plugin.name);
            plugin.isConfigured = configBlocks.length > 0;
            plugin.hasChildBridges = childBridges.length > 0;
            plugin.hasChildBridgesUnpaired = childBridges.filter((x) => x.paired === false).length > 0;
          } catch (err) {
            // May not be technically correct, but if we can't load the config, assume the least worst state
            plugin.isConfigured = true;
            plugin.hasChildBridges = true;
            plugin.hasChildBridgesUnpaired = false;
          }
        }),
    );
  }

  search() {
    this.installedPlugins = [];
    this.loading = true;

    this.$api.get(`/plugins/search/${encodeURIComponent(this.form.value.query)}`).subscribe(
      (data) => {
        this.installedPlugins = data.filter((x) => x.name !== 'homebridge-config-ui-x');
        this.appendMetaInfo();
        this.loading = false;
      },
      (err) => {
        this.loading = false;
        this.$toastr.error(`${err.error.message || err.message}`, 'Error');
        this.loadInstalledPlugins();
      },
    );
  }

  onClearSearch() {
    this.form.setValue({ query: '' });
    this.loadInstalledPlugins();
  }

  onSubmit({ value }) {
    if (!value.query.length) {
      this.loadInstalledPlugins();
    } else {
      this.search();
    }
  }

  getChildBridgeMetadata() {
    this.io.request('get-homebridge-child-bridge-status').subscribe((data) => {
      this.childBridges = data;
    });
  }

  getPluginChildBridges(plugin) {
    return this.childBridges.filter((x) => x.plugin === plugin.name);
  }

  ngOnDestroy() {
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe();
    }
    this.io.end();
  }
}
