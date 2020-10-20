import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { JwtHelperService } from '@auth0/angular-jwt';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '@/app/core/api.service';
import { AuthService } from '@/app/core/auth/auth.service';
import { NotificationService } from '@/app/core/notification.service';

@Component({
  selector: 'app-homebridge-google-smarthome',
  templateUrl: './homebridge-google-smarthome.component.html',
  styleUrls: ['./homebridge-google-smarthome.component.scss'],
})
export class HomebridgeGoogleSmarthomeComponent implements OnInit, OnDestroy {
  private linkDomain = 'https://homebridge-gsh.iot.oz.nu';
  private linkUrl = this.linkDomain + '/link-account';
  private popup;
  private originCheckInterval;
  public justLinked = false;
  public pluginConfig;
  public linkType: string;

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
    private $jwtHelper: JwtHelperService,
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
        name: 'Google Smart Home',
        platform: this.schema.pluginAlias,
      };
    }

    this.parseToken();
  }

  windowMessageListener = (e) => {
    if (e.origin !== this.linkDomain) {
      console.error('Refusing to process message from', e.origin);
      console.error(e);
    }

    try {
      const data = JSON.parse(e.data);
      if (data.token) {
        this.processToken(data.token);
      }
    } catch (e) {
      console.error(e);
    }
  }

  linkAccount() {
    const w = 450;
    const h = 700;
    const y = window.top.outerHeight / 2 + window.top.screenY - (h / 2);
    const x = window.top.outerWidth / 2 + window.top.screenX - (w / 2);
    this.popup = window.open(
      this.linkUrl, 'oznu-google-smart-home-auth',
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
      name: 'Google Smart Home',
      platform: this.schema.pluginAlias,
    };

    const existingConfigIndex = this.homebridgeConfig.platforms.findIndex(x => x.platform === this.schema.pluginAlias);
    this.homebridgeConfig.platforms.splice(existingConfigIndex, 1);

    this.saveConfig();
  }

  processToken(token) {
    clearInterval(this.originCheckInterval);
    if (this.popup) {
      this.popup.close();
    }
    this.pluginConfig.token = token;
    this.pluginConfig.notice = 'Keep your token a secret!';

    const existingConfig = this.homebridgeConfig.platforms.find(x => x.platform === this.schema.pluginAlias);
    if (!existingConfig) {
      this.homebridgeConfig.platforms.push(this.pluginConfig);
    }

    this.parseToken();
    this.saveConfig();
  }

  parseToken() {
    if (this.pluginConfig.token) {
      try {
        const decoded = this.$jwtHelper.decodeToken(this.pluginConfig.token);
        this.linkType = decoded.id.split('|')[0].split('-')[0];
      } catch (e) {
        this.$toastr.error('Invalid account linking token in config.json', this.translate.instant('toast.title_error'));
        delete this.pluginConfig.token;
      }
    }
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
