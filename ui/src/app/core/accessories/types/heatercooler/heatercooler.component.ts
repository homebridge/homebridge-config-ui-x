import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../../accessories.interfaces';

import { HeaterCoolerManageComponent } from './heatercooler.manage.component';

@Component({
  selector: 'app-heatercooler',
  templateUrl: './heatercooler.component.html',
  styleUrls: ['./heatercooler.component.scss'],
})
export class HeaterCoolerComponent implements OnInit {
  @Input() public service: ServiceTypeX;
  model = 1;

  constructor(
    private modalService: NgbModal,
  ) { }

  ngOnInit() {
  }

  onClick() {
    this.service.getCharacteristic('Active').setValue(!this.service.values.Active);
  }

  onLongClick() {
    const ref = this.modalService.open(HeaterCoolerManageComponent, {
      size: 'sm',
    });
    ref.componentInstance.service = this.service;
  }

}
