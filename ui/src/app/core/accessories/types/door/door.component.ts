import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../../accessories.interfaces';

import { DoorManageComponent } from './door.manage.component';

@Component({
  selector: 'app-door',
  templateUrl: './door.component.html',
  styleUrls: ['./door.component.scss'],
})
export class DoorComponent implements OnInit {
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
    const ref = this.modalService.open(DoorManageComponent, {
      size: 'sm',
    });
    ref.componentInstance.service = this.service;
  }

}
