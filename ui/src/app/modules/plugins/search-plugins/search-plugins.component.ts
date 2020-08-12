import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { AuthService } from '@/app/core/auth/auth.service';
import { ApiService } from '@/app/core/api.service';
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service';
import { DonateModalComponent } from '../donate-modal/donate-modal.component';

@Component({
  selector: 'app-plugins.search',
  templateUrl: '../plugins.component.html',
  styleUrls: ['../plugins.component.scss'],
})
export class SearchPluginsComponent implements OnInit, OnDestroy {
  public query: string;
  public form: FormGroup;
  public installedPlugins: any = [];
  public loading = true;
  private navigationSubscription;

  constructor(
    public $auth: AuthService,
    private $api: ApiService,
    public $plugin: ManagePluginsService,
    public $router: Router,
    private $route: ActivatedRoute,
    public $fb: FormBuilder,
    private $modal: NgbModal,
    private $toastr: ToastrService,
  ) { }

  ngOnInit() {
    this.$route.params
      .subscribe((params) => {
        this.query = params.query;
        this.search();

        this.form = this.$fb.group({
          query: [this.query, Validators.required],
        });
      });

    this.navigationSubscription = this.$router.events.subscribe((e: any) => {
      // If it is a NavigationEnd event re-initalise the component
      if (e instanceof NavigationEnd) {
        this.search();
      }
    });

  }

  search() {
    this.loading = true;
    this.$api.get(`/plugins/search/${encodeURIComponent(this.query)}`).subscribe(
      (data) => {
        this.installedPlugins = data;
        this.loading = false;
      },
      (err) => {
        this.loading = false;
        this.$toastr.error(`${err.error.message || err.message}`, 'Error');
      },
    );
  }

  onClearSearch() {
    this.form.setValue({ query: '' });
    this.$router.navigate(['/plugins']);
  }

  onSubmit({ value, valid }) {
    if (!value.query.length) {
      this.$router.navigate(['/plugins']);
    } else {
      this.$router.navigate(['/plugins/search', value.query]);
    }
  }

  openFundingModal(plugin) {
    const ref = this.$modal.open(DonateModalComponent);
    ref.componentInstance.plugin = plugin;
  }

  ngOnDestroy() {
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe();
    }
  }

}
