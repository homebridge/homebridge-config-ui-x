import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '@/app/core/api.service';
import { AuthService } from '@/app/core/auth/auth.service';
import { NotificationService } from '@/app/core/notification.service';

@Component({
  selector: 'app-homebridge-honeywell-home',
  templateUrl: './homebridge-honeywell-home.component.html',
  styleUrls: ['./homebridge-honeywell-home.component.scss'],
})
export class HomebridgeHoneywellHomeComponent implements OnInit, OnDestroy {
  private linkDomain = 'https://homebridge-honeywell.iot.oz.nu';
  public linkUrl = this.linkDomain + '/link-account';
  private popup;
  private originCheckInterval;
  public justLinked = false;
  public pluginConfig;

  public jsonFormOptions = {
    addSubmit: false,
    loadExternalAssets: false,
    returnEmptyFields: false,
    setSchemaDefaults: true,
  };

  @Input() public pluginName;
  @Input() public schema;
  @Input() homebridgeConfig;

  constructor(
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    private $api: ApiService,
    public $auth: AuthService,
    private $notification: NotificationService,
    private $toastr: ToastrService,
  ) {
    // listen for sign in events from the link account popup
    window.addEventListener('message', this.windowMessageListener, false);
  }

  ngOnInit() {
    if (!this.homebridgeConfig.platforms) {
      this.homebridgeConfig.platforms = [];
    }

    this.pluginConfig = this.homebridgeConfig.platforms.find(x => x.platform === this.schema.pluginAlias);

    if (!this.pluginConfig) {
      this.pluginConfig = {
        platform: this.schema.pluginAlias,
        name: this.schema.pluginAlias,
      };
    }
  }

  windowMessageListener = (e) => {
    if (e.origin !== this.linkDomain) {
      console.error('Refusing to process message from', e.origin);
      console.error(e);
    }

    try {
      const data = JSON.parse(e.data);
      this.addCredentials(data);
    } catch (e) {
      console.error(e);
    }
  }

  linkAccount() {
    const w = 450;
    const h = 700;
    const y = window.top.outerHeight / 2 + window.top.screenY - (h / 2);
    const x = window.top.outerWidth / 2 + window.top.screenX - (w / 2);

    const urlToOpen = this.linkUrl + `?consumerKey=${encodeURIComponent(this.pluginConfig.consumerKey)}&consumerSecret=${encodeURIComponent(this.pluginConfig.consumerSecret)}`;

    this.popup = window.open(
      urlToOpen, 'oznu-google-smart-home-auth',
      'toolbar=no, location=no, directories=no, status=no, menubar=no scrollbars=no, resizable=no, copyhistory=no, ' +
      'width=' + w + ', height=' + h + ', top=' + y + ', left=' + x,
    );

    // simple message to popup to provide the current hostname
    this.originCheckInterval = setInterval(() => {
      this.popup.postMessage('origin-check', this.linkDomain);
    }, 2000);
  }

  unlinkAccount() {
    this.pluginConfig = {
      platform: this.schema.pluginAlias,
    };

    const existingConfigIndex = this.homebridgeConfig.platforms.findIndex(x => x.platform === this.schema.pluginAlias);
    this.homebridgeConfig.platforms.splice(existingConfigIndex, 1);

    this.saveConfig();
  }

  addCredentials(credentials) {
    clearInterval(this.originCheckInterval);
    if (this.popup) {
      this.popup.close();
    }

    this.pluginConfig.credentials = credentials;

    const existingConfig = this.homebridgeConfig.platforms.find(x => x.platform === this.schema.pluginAlias);
    if (!existingConfig) {
      this.homebridgeConfig.platforms.push(this.pluginConfig);
    }

    this.saveConfig();
  }

  saveConfig() {
    return this.$api.post('/config-editor', this.homebridgeConfig).toPromise()
      .then((result) => {
        this.justLinked = true;
        this.$toastr.success(
          this.translate.instant('plugins.settings.toast_restart_required'),
          this.translate.instant('plugins.settings.toast_plugin_config_saved'),
        );
      })
      .catch((err) => {
        this.$toastr.error(this.translate.instant('config.toast_failed_to_save_config'), this.translate.instant('toast.title_error'));
      });
  }

  async saveAndClose() {
    this.pluginConfig.platform = this.schema.pluginAlias;
    const existingConfigIndex = this.homebridgeConfig.platforms.findIndex(x => x.platform === this.schema.pluginAlias);
    this.homebridgeConfig.platforms[existingConfigIndex] = this.pluginConfig;

    await this.saveConfig();
    this.activeModal.close();
    this.$notification.configUpdated.next();
  }

  close() {
    this.activeModal.close();
  }

  ngOnDestroy() {
    clearInterval(this.originCheckInterval);
    window.removeEventListener('message', this.windowMessageListener);
    if (this.popup) {
      this.popup.close();
    }
  }

}
