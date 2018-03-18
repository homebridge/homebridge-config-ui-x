import { Component, OnInit, Input } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { ToastsManager } from 'ng2-toastr/ng2-toastr';
import { StateService } from '@uirouter/angular';
import { ApiService } from '../../../_services/api.service';
import { AuthService } from '../../../_services/auth.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  @Input() env;
  form: FormGroup;

  constructor(
    private $auth: AuthService,
    private $api: ApiService,
    public $fb: FormBuilder,
    public toastr: ToastsManager,
  ) { }

  ngOnInit() {

    this.form = this.$fb.group({
      HOMEBRIDGE_DEBUG: [false],
      HOMEBRIDGE_INSECURE: [false],
      HOMEBRIDGE_CONFIG_UI_THEME: ['red'],
      HOMEBRIDGE_CONFIG_UI_AUTH: ['form']
    });

    this.form.patchValue(this.env);

    this.form.valueChanges.subscribe((data) => {
      // set theme if changed
      if (this.$auth.theme !== data.HOMEBRIDGE_CONFIG_UI_THEME) {
        this.$auth.setTheme(data.HOMEBRIDGE_CONFIG_UI_THEME);
      }

      // save settings
      this.saveSettings(data);
    });

  }

  saveSettings(data) {
    this.$api.dockerSaveEnv(data).subscribe(() => {
      this.toastr.success('Container Restart Required', 'Settings Saved');
    });
  }

}

export function settingsStateResolve($api, toastr, $state) {
  return $api.dockerGetEnv().toPromise().catch((err) => {
    if (err.status === 404) {
      toastr.error(
        'You need to update to the latest version of the oznu/homebridge docker image to use this feature.',
        'Image Update Required',
        {
          toastLife: 30000
        }
      );
    } else {
      toastr.error(err.message, 'Failed To Load Settings');
    }
    $state.go('status');
  });
}

export const SettingsState = {
  name: 'docker.settings',
  url: '/settings',
  views: {
    '!$default': { component: SettingsComponent }
  },
  resolve: [{
    token: 'env',
    deps: [ApiService, ToastsManager, StateService],
    resolveFn: settingsStateResolve
  }],
  data: {
    requiresAuth: true,
    requiresAdmin: true
  }
};
