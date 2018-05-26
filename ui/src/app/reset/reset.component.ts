import { Component } from '@angular/core';
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
    private $state: StateService,
    private $api: ApiService,
  ) { }

  onResetHomebridgeAccessoryClick() {
    this.clicked = true;
    return this.$api.resetHomebridgeAccessory().subscribe(
      data => {
        this.toastr.success('Homebridge Accessory Reset', 'Success!');
        this.activeModal.close();
        this.$state.go('restart');
      },
      err => {
        this.toastr.error('Failed to reset Homebridge. See Logs.', 'Error');
      }
    );
  }
}
