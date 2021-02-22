import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../../accessories.interfaces';

import { WindowManageComponent } from './window.manage.component';

@Component({
  selector: 'app-window',
  templateUrl: './window.component.html',
  styleUrls: ['./window.component.scss'],
})
export class WindowComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor(
    private modalService: NgbModal,
  ) { }

  ngOnInit() { }

  onClick() {
    if (this.service.values.TargetPosition) {
      this.service.getCharacteristic('TargetPosition').setValue(0);
    } else {
      this.service.getCharacteristic('TargetPosition').setValue(100);
    }
  }

  onLongClick() {
    const ref = this.modalService.open(WindowManageComponent, {
      size: 'sm',
    });
    ref.componentInstance.service = this.service;
  }

}
