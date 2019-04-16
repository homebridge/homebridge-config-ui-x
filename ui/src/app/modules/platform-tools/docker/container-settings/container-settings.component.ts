import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../../core/auth/auth.service';
import { ApiService } from '../../../../core/api.service';

@Component({
  selector: 'app-container-settings',
  templateUrl: './container-settings.component.html',
  styleUrls: ['./container-settings.component.scss'],
})
export class ContainerSettingsComponent implements OnInit {
  public env: any;
  public form: FormGroup;

  constructor(
    public $auth: AuthService,
    private $api: ApiService,
    public $fb: FormBuilder,
    public $toastr: ToastrService,
    private $route: ActivatedRoute,
    private translate: TranslateService,
  ) { }

  ngOnInit() {
    this.form = this.$fb.group({
      HOMEBRIDGE_DEBUG: [false],
      HOMEBRIDGE_INSECURE: [false],
    });

    this.$route.data
      .subscribe((data: { env: any }) => {
        this.env = data.env;
        this.form.patchValue(this.env);
      });

    this.form.valueChanges.subscribe(this.saveSettings.bind(this));
  }

  saveSettings(data = this.form.value) {
    this.$api.put('/platform-tools/docker/env', data).subscribe(() => {
      this.$toastr.success(
        this.translate.instant('platform.docker.settings.toast_container_restart_required'),
        this.translate.instant('platform.docker.settings.toast_title_settings_saved'),
      );
    });
  }

}
