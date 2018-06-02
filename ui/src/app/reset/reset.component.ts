import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal, NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { StateService } from '@uirouter/angular';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '../_services/api.service';

@Component({
  selector: 'app-reset',
  templateUrl: './reset.component.html'
})
export class ResetComponent {

  constructor(
    private modalService: NgbModal
  ) { }

  resetHomebridgeState() {
    this.modalService.open(ResetModalComponent, {
      size: 'lg'
    });
  }

}

@Component({
  templateUrl: './reset.modal.component.html'
})
export class ResetModalComponent {
  public clicked: boolean;

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastrService,
    private translate: TranslateService,
    private $state: StateService,
    private $api: ApiService,
  ) { }

  onResetHomebridgeAccessoryClick() {
    this.clicked = true;
    return this.$api.resetHomebridgeAccessory().subscribe(
      data => {
        this.toastr.success(this.translate.instant('reset.toast_accessory_reset'), this.translate.instant('toast.title_success'));
        this.activeModal.close();
        this.$state.go('restart');
      },
      async err => {
        this.toastr.error(this.translate.instant('reset.toast_failed_to_reset'), this.translate.instant('toast.title_error'));
      }
    );
  }
}
