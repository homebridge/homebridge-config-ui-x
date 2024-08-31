import { Component, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '@/app/core/api.service';

@Component({
  templateUrl: './unpair-single-bridge.component.html',
})
export class UnpairSingleBridgeComponent implements OnInit {
  public pairings: any[];
  public deleting: null | string = null;

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastrService,
    private translate: TranslateService,
    private $api: ApiService,
  ) {}

  ngOnInit(): void {
    this.loadPairings();
  }

  async loadPairings() {
    try {
      this.pairings = (await this.$api.get('/server/pairings').toPromise())
        // eslint-disable-next-line no-underscore-dangle
        .sort((a, b) => b._main ? 1 : -1);
    } catch (e) {
      this.toastr.error('Paired accessories could not be loaded.', this.translate.instant('toast.title_error'));
      this.activeModal.close();
    }
  }

  removeAccessory(id: string) {
    this.deleting = id;

    this.$api.delete(`/server/pairings/${id}`).subscribe(
      async () => {
        await this.loadPairings();

        if (!this.pairings.length) {
          this.activeModal.close();
        }

        this.deleting = null;

        this.toastr.success(
          this.translate.instant('plugins.settings.toast_restart_required'),
          this.translate.instant('toast.title_success'),
        );
      },
      () => {
        this.deleting = null;
        this.toastr.error('Failed to un-pair accessory.', this.translate.instant('toast.title_error'));
      },
    );
  }
}
