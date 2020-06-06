import { Component, OnInit, Input } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '../../../../core/api.service';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-homebridge-ring',
  templateUrl: './homebridge-ring.component.html',
  styleUrls: ['./homebridge-ring.component.scss'],
})
export class HomebridgeRingComponent implements OnInit {
  public linkAccountForm: FormGroup;
  public loginFailReason: string;
  public twoFactorRequired = false;
  public codeSentTo: string;
  public doingLogin = false;

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
    public formBuilder: FormBuilder,
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    private $api: ApiService,
    public $auth: AuthService,
    private $toastr: ToastrService,
  ) { }

  async ngOnInit() {
    this.linkAccountForm = this.formBuilder.group({
      email: ['', Validators.required],
      password: ['', Validators.required],
      twoFactorAuthCode: [''],
    });

    if (!this.homebridgeConfig.platforms) {
      this.homebridgeConfig.platforms = [];
    }
    this.pluginConfig = this.homebridgeConfig.platforms.find(x => x.platform === this.schema.pluginAlias);

    if (!this.pluginConfig) {
      this.pluginConfig = {
        platform: this.schema.pluginAlias,
        name: 'Ring',
      };
    }
  }


  linkAccount() {
    this.doingLogin = true;
    this.loginFailReason = undefined;
    return this.$api.post('/plugins/custom-plugins/homebridge-ring/exchange-credentials', this.linkAccountForm.value).subscribe(
      async (data) => {

        this.pluginConfig.refreshToken = data.refresh_token;

        const existingConfig = this.homebridgeConfig.platforms.find(x => x.platform === this.schema.pluginAlias);
        if (!existingConfig) {
          this.homebridgeConfig.platforms.push(this.pluginConfig);
        }

        await this.saveConfig();
        this.linkAccountForm.reset();
        this.doingLogin = false;
        this.twoFactorRequired = false;
      },
      (err) => {
        this.doingLogin = false;
        if (err.status === 412) {
          // 2fa required
          this.twoFactorRequired = true;
          if (err.error && err.error.phone) {
            this.codeSentTo = err.error.phone;
          }
        } else {
          // other authentication error
          if (err.error && err.error.error_description) {
            this.loginFailReason = err.error.error_description;
          } else {
            this.loginFailReason = 'Login Failed';
          }
        }
      },
    );
  }

  unlinkAccount() {
    this.pluginConfig = {
      platform: this.schema.pluginAlias,
    };

    const existingConfigIndex = this.homebridgeConfig.platforms.findIndex(x => x.platform === this.schema.pluginAlias);
    this.homebridgeConfig.platforms.splice(existingConfigIndex, 1);

    this.saveConfig();
  }

  async saveConfig() {
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
  }

  close() {
    this.activeModal.close();
  }

}
