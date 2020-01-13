import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

import { AuthService } from '../../core/auth/auth.service';
import { ApiService } from '../../core/api.service';
import { debounceTime } from 'rxjs/operators';

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
    private $route: ActivatedRoute,
    private translate: TranslateService,
  ) { }

  ngOnInit() {
    if (this.$auth.env.runningInDocker) {
      this.initDockerForm();
    } else if (this.$auth.env.serviceMode) {
      this.initServiceModeForm();
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
      HOMEBRIDGE_REMOVE_ORPHANS: [false],
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


}
