import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { WsService } from '@/app/core/ws.service';
import { ApiService } from '@/app/core/api.service';

@Component({
  selector: 'app-homebridge-nest-cam',
  templateUrl: './homebridge-nest-cam.component.html',
  styleUrls: ['./homebridge-nest-cam.component.scss'],
})
export class HomebridgeNestCamComponent implements OnInit, OnDestroy {
  private io = this.$ws.connectToNamespace('plugins/custom-plugins/homebridge-nest-cam');

  public pluginConfig;
  public linkAccountForm: FormGroup;

  public doingAccountLinking = false;
  public waiting = false;
  public waitingMessage = '';

  public currentStep: 'username' | 'password' | 'totp';

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
    private $toastr: ToastrService,
    private $ws: WsService,
    private $api: ApiService,
  ) { }

  ngOnInit(): void {
    if (!this.homebridgeConfig.platforms) {
      this.homebridgeConfig.platforms = [];
    }
    this.pluginConfig = this.homebridgeConfig.platforms.find(x => x.platform === this.schema.pluginAlias);

    if (!this.pluginConfig) {
      this.pluginConfig = {
        platform: this.schema.pluginAlias,
      };
    }

    this.io.socket.on('username', () => {
      this.linkAccountForm.controls.username.setValidators([Validators.required]);
      this.currentStep = 'username';
      this.waiting = false;
      this.waitingMessage = 'Logging in, please wait...';
    });

    this.io.socket.on('password', () => {
      this.linkAccountForm.controls.password.setValidators([Validators.required]);
      this.currentStep = 'password';
      this.waiting = false;
    });

    this.io.socket.on('totp', () => {
      this.linkAccountForm.controls.totp.setValidators([Validators.required]);
      this.currentStep = 'totp';
      this.waiting = false;
    });

    this.io.socket.on('credentials', (credentials) => {
      this.linkAccountForm.controls.totp.setValidators([Validators.required]);
      this.currentStep = undefined;
      this.waiting = false;
      this.pluginConfig.googleAuth = credentials;
      this.pluginConfig.doingAccountLinking = false;

      this.pluginConfig.platform = this.schema.pluginAlias;
      const existingConfig = this.homebridgeConfig.platforms.find(x => x.platform === this.schema.pluginAlias);
      if (!existingConfig) {
        this.homebridgeConfig.platforms.push(this.pluginConfig);
      }

      this.saveConfig();
    });
  }

  linkAccount() {
    this.linkAccountForm = new FormGroup({
      username: new FormControl(''),
      password: new FormControl(''),
      totp: new FormControl('', []),
    });

    this.waiting = true;
    this.waitingMessage = 'Setting things up, please wait...';

    this.io.socket.emit('link-account');
    this.doingAccountLinking = true;
  }

  unlinkAccount() {
    delete this.pluginConfig.googleAuth;

    const existingConfigIndex = this.homebridgeConfig.platforms.findIndex(x => x.platform === this.schema.pluginAlias);
    this.homebridgeConfig.platforms.splice(existingConfigIndex, 1);

    this.saveConfig();
  }

  nextStep() {
    this.waiting = true;
    this.io.socket.emit(this.currentStep, this.linkAccountForm.value);
  }

  async saveConfig() {
    return this.$api.post('/config-editor', this.homebridgeConfig).toPromise()
      .then((result) => {
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

  ngOnDestroy(): void {
    this.io.end();
  }

}
