import { Component, OnInit, Input, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { StateService } from '@uirouter/angular';

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
    public $fb: FormBuilder
  ) { }

  ngOnInit() {
    // load list of installed plugins
    this.$api.getInstalledPlugins().subscribe(
      (data) => {
         this.installedPlugins = data;
         this.loading = false;
      },
      (err) => {}
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
  component: PluginsComponent
};

export { PluginsComponent, PluginStates };
