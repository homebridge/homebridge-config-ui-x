import { Component, OnInit } from '@angular/core';
import { StateService } from '@uirouter/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '../_services/api.service';
import { AuthService } from '../_services/auth.service';
import { PluginService } from '../_services/plugin.service';
import { WsService } from '../_services/ws.service';

@Component({
  selector: 'app-plugins.search',
  templateUrl: './plugins.component.html',
  styleUrls: ['./plugins.component.scss']
})
export class PluginSearchComponent implements OnInit {
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
    private toastr: ToastrService
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

    this.$api.get(`/plugins/search/${this.searchQuery}`).subscribe(
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
    if (!value.query.length) {
      this.$state.go('plugins');
    } else {
      this.$state.go('plugins.search', { query: value.query });
    }
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
