import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { ApiService } from '@/app/core/api.service';
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
      const installedPlugins = await this.$api.get('/plugins').toPromise();
      this.installedPlugins = installedPlugins.filter((x) => x.name !== 'homebridge-config-ui-x');
      this.appendMetaInfo();
      this.loading = false;
    } catch (err) {
      this.$toastr.error(
        `${this.$translate.instant('plugins.toast_failed_to_load_plugins')}: ${err.message}`,
        this.$translate.instant('toast.title_error'),
      );
    }
  }

  async appendMetaInfo() {
    // Also get the current configuration for each plugin
    await Promise.all(this.installedPlugins
      .filter((plugin) => plugin.installedVersion)
      .map(async (plugin) => {
        try {
          const configBlocks = await this.$api.get(`/config-editor/plugin/${encodeURIComponent(plugin.name)}`).toPromise();
          plugin.isConfigured = configBlocks.length > 0;
          // eslint-disable-next-line no-underscore-dangle
          plugin.hasChildBridges = plugin.isConfigured && configBlocks.some((x) => x._bridge && x._bridge.username);
        } catch (err) {
          // may not be technically correct, but if we can't load the config, assume it is configured
          plugin.isConfigured = true;
          plugin.hasChildBridges = true;
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
    return this.childBridges.filter(x => x.plugin === plugin.name);
  }

  ngOnDestroy() {
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe();
    }
    this.io.end();
  }
}
