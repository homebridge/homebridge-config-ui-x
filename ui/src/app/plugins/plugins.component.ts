import { Component, OnInit, Input, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { StateService } from '@uirouter/angular';
import { ToastsManager } from 'ng2-toastr/src/toast-manager';

import { ApiService } from '../_services/api.service';
import { PluginService } from '../_services/plugin.service';

@Component({
  selector: 'app-plugins',
  templateUrl: './plugins.component.html'
})
class PluginsComponent implements OnInit {
  form: FormGroup;
  installedPlugins: any = [];
  loading = true;
  searchQuery: string;

  constructor(
    private $api: ApiService,
    private $plugin: PluginService,
    private $state: StateService,
    public $fb: FormBuilder,
    private toastr: ToastsManager
  ) { }

  ngOnInit() {
    // load list of installed plugins
    this.$api.getInstalledPlugins().subscribe(
      (data: any) => {
         this.installedPlugins = data.sort(x => !x.update);
         this.loading = false;
      },
      (err) => {
        this.toastr.error(`Failed to load plugins: ${err.message}`, 'Error');
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

const PluginStates = {
  name: 'plugins',
  url: '/plugins',
  component: PluginsComponent,
  data: {
    requiresAuth: true
  }
};

export { PluginsComponent, PluginStates };
