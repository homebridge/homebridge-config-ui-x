import { Component, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import { ApiService } from '@/app/core/api.service';

@Component({
  selector: 'app-unpair-accessory-modal',
  templateUrl: './unpair-accessory-modal.component.html',
  styleUrls: ['./unpair-accessory-modal.component.scss'],
})
export class UnpairAccessoryModalComponent implements OnInit {
  public pairings: any[];
  public deleting: null | string = null;

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastrService,
    private translate: TranslateService,
    private $api: ApiService,
  ) { }

  ngOnInit(): void {
    this.loadParings();
  }

  async loadParings() {
    try {
      this.pairings = (await this.$api.get('/server/pairings').toPromise())
        .sort((a, b) => b._main ? 1 : -1);
    } catch (e) {
      this.toastr.error('Paired accessories could not be loaded.', this.translate.instant('toast.title_error'));
      this.activeModal.close();
    }
  }

  removeAccessory(id: string) {
    this.deleting = id;

    this.$api.delete(`/server/pairings/${id}`).subscribe(
      async data => {
        await this.loadParings();

        if (!this.pairings.length) {
          this.activeModal.close();
        }

        this.deleting = null;

        this.toastr.success(
          this.translate.instant('plugins.settings.toast_restart_required'),
          this.translate.instant('toast.title_success'),
        );
      },
      err => {
        this.deleting = null;
        this.toastr.error('Failed to un-pair accessory.', this.translate.instant('toast.title_error'));
      },
    );
  }

}
