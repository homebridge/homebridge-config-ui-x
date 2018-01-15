import { Component, OnInit } from '@angular/core';
import { StateService } from '@uirouter/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastsManager } from 'ng2-toastr/src/toast-manager';

import { ApiService } from '../_services/api.service';
import { PluginService } from '../_services/plugin.service';

@Component({
  selector: 'app-plugins.search',
  templateUrl: './plugins.component.html',
})
export class PluginSearchComponent implements OnInit {
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
    this.searchQuery = decodeURIComponent(this.$state.params.query);

    this.form = this.$fb.group({
      query: ['', Validators.required],
    });

    // set value from url
    this.form.patchValue({
      query: this.searchQuery
    });

    this.$api.searchNpmForPlugins(this.searchQuery).subscribe(
      (data) => {
        this.installedPlugins = data;
        this.loading = false;
      },
      (err) => {
        this.toastr.error(`Failed search npm: ${err.message}`, 'Error');
      }
    );
  }

  onSubmit({ value, valid }) {
    this.$state.go('plugins.search', {query: value.query});
  }

}

export const PluginSearchStates = {
  name: 'plugins.search',
  url: '/:query',
  views: {
    '!$default': { component: PluginSearchComponent }
  },
  data: {
    requiresAuth: true
  }
};
