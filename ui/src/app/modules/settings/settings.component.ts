import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { debounceTime } from 'rxjs/operators';

import { AuthService } from '@/app/core/auth/auth.service';
import { ApiService } from '@/app/core/api.service';
import { RemoveAllCachedAccessoriesModalComponent } from './remove-all-cached-accessories-modal/remove-all-cached-accessories-modal.component';
import { ResetHomebridgeModalComponent } from './reset-homebridge-modal/reset-homebridge-modal.component';
import { RemoveSingleCachedAccessoryModalComponent } from './remove-single-cached-accessory-modal/remove-single-cached-accessory-modal.component';
import { UnpairAccessoryModalComponent } from './unpair-accessory-modal/unpair-accessory-modal.component';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit {
  public serviceForm: FormGroup;
  public saved = false;

  constructor(
    public $auth: AuthService,
    private $api: ApiService,
    public $fb: FormBuilder,
    public $toastr: ToastrService,
    private $modal: NgbModal,
    private $route: ActivatedRoute,
    private $router: Router,
    private translate: TranslateService,
  ) { }

  ngOnInit() {
    if (this.$auth.env.serviceMode) {
      this.initServiceModeForm();
    } else if (this.$auth.env.runningInDocker) {
      this.initDockerForm();
    }
  }

  initDockerForm() {
    this.serviceForm = this.$fb.group({
      HOMEBRIDGE_DEBUG: [false],
      HOMEBRIDGE_INSECURE: [false],
    });

    this.$api.get('/platform-tools/docker/env').subscribe(
      (data) => {
        this.serviceForm.patchValue(data);
        this.serviceForm.valueChanges.subscribe(this.saveDockerSettings.bind(this));
      },
      (err) => {
        this.$toastr.error(err.message, 'Failed to load docker settings');
      },
    );
  }

  saveDockerSettings(data = this.serviceForm.value) {
    this.$api.put('/platform-tools/docker/env', data).subscribe(() => {
      this.$toastr.success(
        this.translate.instant('platform.docker.settings.toast_container_restart_required'),
        this.translate.instant('platform.docker.settings.toast_title_settings_saved'),
      );
      this.saved = true;
    });
  }

  initServiceModeForm() {
    this.serviceForm = this.$fb.group({
      HOMEBRIDGE_DEBUG: [false],
      HOMEBRIDGE_KEEP_ORPHANS: [false],
      HOMEBRIDGE_INSECURE: [true],
      ENV_DEBUG: [null],
      ENV_NODE_OPTIONS: [null],
    });

    this.$api.get('/platform-tools/hb-service/homebridge-startup-settings').subscribe(
      (data) => {
        this.serviceForm.patchValue(data);
        this.serviceForm.valueChanges.pipe(debounceTime(500)).subscribe(this.saveServiceModeSettings.bind(this));
      },
      (err) => {
        this.$toastr.error(err.message, 'Failed to load docker settings');
      },
    );
  }

  saveServiceModeSettings(data = this.serviceForm.value) {
    this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', data).subscribe(() => {
      this.saved = true;
    });
  }

  resetHomebridgeState() {
    this.$modal.open(ResetHomebridgeModalComponent, {
      size: 'lg',
    });
  }

  unpairAccessory() {
    this.$modal.open(UnpairAccessoryModalComponent, {
      size: 'lg',
    });
  }

  removeAllCachedAccessories() {
    this.$modal.open(RemoveAllCachedAccessoriesModalComponent, {
      size: 'lg',
    });
  }

  removeSingleCachedAccessories() {
    this.$modal.open(RemoveSingleCachedAccessoryModalComponent, {
      size: 'lg',
    });
  }

  forceRestartService() {
    this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe(
      () => {
        this.$router.navigate(['/restart']);
      },
      (err) => {
        this.$toastr.error(err.message, 'Failed to set force setvice restart flag.');
      },
    );
  }

}
