import { Component, OnInit, Input } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '@/app/core/api.service';
import { AuthService } from '@/app/core/auth/auth.service';
import { NotificationService } from '@/app/core/notification.service';

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
  public ringConfig: Record<string, any>;

  public jsonFormOptions = {
    addSubmit: false,
    loadExternalAssets: false,
    returnEmptyFields: false,
    setSchemaDefaults: true,
  };

  @Input() public plugin;
  @Input() public schema;
  @Input() pluginConfig: Record<string, any>[];

  constructor(
    public formBuilder: FormBuilder,
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    private $api: ApiService,
    public $auth: AuthService,
    private $notification: NotificationService,
    private $toastr: ToastrService,
  ) { }

  async ngOnInit() {
    this.linkAccountForm = this.formBuilder.group({
      email: ['', Validators.required],
      password: ['', Validators.required],
      twoFactorAuthCode: [undefined],
    });

    if (!this.pluginConfig.length) {
      this.pluginConfig.push({ platform: this.schema.pluginAlias, name: 'Ring' });
    }

    this.ringConfig = this.pluginConfig[0];
  }


  linkAccount() {
    this.doingLogin = true;
    this.loginFailReason = undefined;
    return this.$api.post('/plugins/custom-plugins/homebridge-ring/exchange-credentials', this.linkAccountForm.value).subscribe(
      async (data) => {
        this.ringConfig.refreshToken = data.refresh_token;

        if (!this.pluginConfig.length) {
          this.pluginConfig.push(this.ringConfig);
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
    this.ringConfig = {
      platform: this.schema.pluginAlias,
    };

    this.pluginConfig.splice(0, this.pluginConfig.length);
    this.saveConfig();
  }

  async saveConfig() {
    return this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, this.pluginConfig).toPromise()
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
    this.ringConfig.platform = this.schema.pluginAlias;
    this.pluginConfig[0] = this.ringConfig;

    await this.saveConfig();
    this.activeModal.close();
    this.$notification.configUpdated.next();
  }

  close() {
    this.activeModal.close();
  }

}
