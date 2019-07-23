import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '../../../../core/api.service';

@Component({
  selector: 'app-homebridge-google-smarthome',
  templateUrl: './homebridge-google-smarthome.component.html',
  styleUrls: ['./homebridge-google-smarthome.component.scss'],
})
export class HomebridgeGoogleSmarthomeComponent implements OnInit, OnDestroy {
  private popup;
  public pluginConfig;

  @Input() pluginName;
  @Input() schema;
  @Input() homebridgeConfig;

  constructor(
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    private $api: ApiService,
    private $toastr: ToastrService,
  ) {
    // listen for sign in events from the link account popup
    window.addEventListener('message', this.windowMessageListener, false);
  }

  windowMessageListener = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.token) {
        this.processToken(data.token);
      }
    } catch (e) {
      console.error(e);
    }
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
  }

  linkAccount() {
    const w = 450;
    const h = 700;
    const y = window.top.outerHeight / 2 + window.top.screenY - (h / 2);
    const x = window.top.outerWidth / 2 + window.top.screenX - (w / 2);
    this.popup = window.open(
      'https://homebridge-gsh.iot.oz.nu/user/link-account', 'oznu-google-smart-home-auth',
      'toolbar=no, location=no, directories=no, status=no, menubar=no scrollbars=no, resizable=no, copyhistory=no, ' +
      'width=' + w + ', height=' + h + ', top=' + y + ', left=' + x,
    );
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
    if (this.popup) {
      this.popup.close();
    }
    this.pluginConfig.token = token;

    const existingConfig = this.homebridgeConfig.platforms.find(x => x.platform === this.schema.pluginAlias);
    if (!existingConfig) {
      this.homebridgeConfig.platforms.push(this.pluginConfig);
    }

    this.saveConfig();
  }

  saveConfig() {
    this.$api.post('/config-editor', this.homebridgeConfig).subscribe(
      (result) => {
        this.$toastr.success(this.translate.instant('config.toast_config_saved'), this.translate.instant('toast.title_success'));
      },
      (err) => {
        this.$toastr.error(this.translate.instant('config.toast_failed_to_save_config'), this.translate.instant('toast.title_error'));
      },
    );
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.windowMessageListener);
    if (this.popup) {
      this.popup.close();
    }
  }

}
