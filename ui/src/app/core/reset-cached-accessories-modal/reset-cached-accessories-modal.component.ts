import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '../api.service';

@Component({
  selector: 'app-reset-cached-accessories-modal',
  templateUrl: './reset-cached-accessories-modal.component.html',
  styleUrls: ['./reset-cached-accessories-modal.component.scss'],
})
export class ResetCachedAccessoriesModalComponent {
  public clicked: boolean;

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastrService,
    private translate: TranslateService,
    private $route: Router,
    private $api: ApiService,
  ) { }

  onResetCachedAccessoriesClick() {
    this.clicked = true;
    return this.$api.put('/server/reset-cached-accessories', {}).subscribe(
      data => {
        this.toastr.success(this.translate.instant('reset.toast_clear_cached_accessories_success'), this.translate.instant('toast.title_success'));
        this.activeModal.close();
      },
      async err => {
        this.toastr.error(this.translate.instant('reset.toast_failed_to_reset'), this.translate.instant('toast.title_error'));
      },
    );
  }
}
