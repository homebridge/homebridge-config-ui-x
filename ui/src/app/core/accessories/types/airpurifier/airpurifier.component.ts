import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../../accessories.interfaces';

import { AirpurifierManageComponent } from './airpurifier.manage.component';

@Component({
  selector: 'app-airpurifier',
  templateUrl: './airpurifier.component.html',
  styleUrls: ['./airpurifier.component.scss'],
})
export class AirpurifierComponent implements OnInit {
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
    const ref = this.modalService.open(AirpurifierManageComponent, {
      size: 'sm',
    });
    ref.componentInstance.service = this.service;
  }

}
