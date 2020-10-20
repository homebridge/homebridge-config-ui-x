import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { WsService } from '@/app/core/ws.service';
import { ApiService } from '@/app/core/api.service';
import { NotificationService } from '@/app/core/notification.service';

@Component({
  selector: 'app-homebridge-nest-cam',
  templateUrl: './homebridge-nest-cam.component.html',
  styleUrls: ['./homebridge-nest-cam.component.scss'],
})
export class HomebridgeNestCamComponent implements OnInit, OnDestroy {
  private io = this.$ws.connectToNamespace('plugins/custom-plugins/homebridge-nest-cam');

  public pluginConfig;
  public linkAccountForm: FormGroup;

  public alreadyConfigured = false;
  public doingAccountLinking = false;
  public accountLinkingError = false;
  public accountLinkingErrorMessage = '';
  public fieldErrorMessage = '';
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
    private $notification: NotificationService,
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
      this.homebridgeConfig.platforms.push(this.pluginConfig);
    }

    if (!this.showLinkAccount) {
      this.alreadyConfigured = true;
    }

    this.io.socket.on('server_error', (payload) => {
      this.accountLinkingError = true;
      this.accountLinkingErrorMessage = payload.message;
    });

    this.io.socket.on('browser_closed', (payload) => {
      if (this.doingAccountLinking === true) {
        this.accountLinkingError = true;
        this.accountLinkingErrorMessage = payload.message;
      }
    });

    this.io.socket.on('disconnect', () => {
      if (this.doingAccountLinking === true) {
        this.accountLinkingError = true;
        this.accountLinkingErrorMessage = 'Server Disconnected.';
      }
    });

    this.io.socket.on('username', () => {
      this.fieldErrorMessage = '';
      this.linkAccountForm.controls.username.setValidators([Validators.required]);

      if (this.currentStep === 'username') {
        this.fieldErrorMessage = `Couldn't find your Google Account`;
      }

      this.currentStep = 'username';
      this.waiting = false;
      this.waitingMessage = 'Logging in, please wait...';
    });

    this.io.socket.on('password', () => {
      this.fieldErrorMessage = '';
      this.linkAccountForm.controls.password.setValidators([Validators.required]);

      if (this.currentStep === 'password') {
        this.fieldErrorMessage = `Wrong password. Try again.`;
      }

      this.currentStep = 'password';
      this.waiting = false;
    });

    this.io.socket.on('totp', () => {
      this.fieldErrorMessage = '';
      this.linkAccountForm.controls.totp.setValidators([Validators.required]);

      if (this.currentStep === 'totp') {
        this.fieldErrorMessage = `Wrong code. Try again.`;
      }

      this.currentStep = 'totp';
      this.waiting = false;
    });

    this.io.socket.on('credentials', (credentials) => {
      this.linkAccountForm.controls.totp.setValidators([Validators.required]);
      this.currentStep = undefined;
      this.waiting = false;
      this.pluginConfig.googleAuth = credentials;
      this.doingAccountLinking = false;

      this.updateConfig();
      this.saveConfig();
    });
  }

  get showLinkAccount(): boolean {
    if (this.alreadyConfigured) {
      return false;
    }
    if (this.pluginConfig?.googleAuth?.issueToken && this.pluginConfig?.googleAuth?.cookies) {
      return false;
    }
    return !this.accountLinkingError;
  }

  linkAccountManually() {
    this.updateConfig();
    this.currentStep = undefined;
    this.doingAccountLinking = false;
    this.alreadyConfigured = true;
    this.io.socket.emit('cancel');
  }

  linkAccount() {
    this.currentStep = undefined;

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

    this.alreadyConfigured = false;
    this.doingAccountLinking = false;

    if (this.accountLinkingError) {
      this.activeModal.close();
    }
  }

  nextStep() {
    this.waiting = true;
    this.io.socket.emit(this.currentStep, this.linkAccountForm.value);
  }

  updateConfig() {
    this.pluginConfig.platform = this.schema.pluginAlias;
    const existingConfig = this.homebridgeConfig.platforms.find(x => x.platform === this.schema.pluginAlias);
    if (!existingConfig) {
      this.homebridgeConfig.platforms.push(this.pluginConfig);
    }
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
    this.$notification.configUpdated.next();
  }

  close() {
    this.activeModal.close();
  }

  ngOnDestroy(): void {
    this.io.end();
  }

}
