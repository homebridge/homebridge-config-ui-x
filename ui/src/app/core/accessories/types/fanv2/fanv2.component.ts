import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../../accessories.interfaces';

import { Fanv2ManageComponent } from './fanv2.manage.component';

@Component({
  selector: 'app-fanv2',
  templateUrl: './fanv2.component.html',
  styleUrls: ['./fanv2.component.scss'],
})
export class Fanv2Component implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor(
    private modalService: NgbModal,
  ) { }

  ngOnInit() {
  }

  onClick() {
    this.service.getCharacteristic('Active').setValue(!this.service.values.Active);

    // set the brightness to 100% if on 0% when turned on
    if (!this.service.values.On && 'RotationSpeed' in this.service.values && !this.service.values.RotationSpeed) {
      this.service.getCharacteristic('RotationSpeed').setValue(100);
    }
  }

  onLongClick() {
    const ref = this.modalService.open(Fanv2ManageComponent, {
      size: 'sm',
    });
    ref.componentInstance.service = this.service;
  }

}
