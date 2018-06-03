import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { StateService } from '@uirouter/angular';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '../_services/api.service';
import { AuthService } from '../_services/auth.service';
import { PluginService } from '../_services/plugin.service';

@Component({
  selector: 'app-plugins',
  templateUrl: './plugins.component.html',
  styleUrls: ['./plugins.component.scss']
})
export class PluginsComponent implements OnInit {
  form: FormGroup;
  installedPlugins: any = [];
  loading = true;
  searchQuery: string;

  constructor(
    public $auth: AuthService,
    private $api: ApiService,
    public $plugin: PluginService,
    private $state: StateService,
    public $fb: FormBuilder,
    private toastr: ToastrService,
    private translate: TranslateService,
  ) { }

  ngOnInit() {
    // load list of installed plugins
    this.$api.getInstalledPlugins().subscribe(
      (data: any) => {
         this.installedPlugins = data.sort(x => !x.update);
         this.loading = false;
      },
      (err) => {
        this.toastr.error(
          `${this.translate.instant('plugins.toast_failed_to_load_plugins')}: ${err.message}`,
          this.translate.instant('toast.title_error')
        );
      }
    );

    this.form = this.$fb.group({
      query: ['', Validators.required],
    });
  }

  onSubmit({ value, valid }) {
    this.$state.go('plugins.search', { query: value.query });
  }

}

export const PluginStates = {
  name: 'plugins',
  url: '/plugins',
  component: PluginsComponent,
  data: {
    requiresAuth: true,
    requiresAdmin: true
  }
};
