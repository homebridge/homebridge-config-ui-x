import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../../accessories.interfaces';

import { LightbulbManageComponent } from './lightbulb.manage.component';

@Component({
  selector: 'app-lightbulb',
  templateUrl: './lightbulb.component.html',
  styleUrls: ['./lightbulb.component.scss'],
})
export class LightbulbComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor(
    private modalService: NgbModal,
  ) { }

  ngOnInit() { }

  onClick() {
    this.service.getCharacteristic('On').setValue(!this.service.values.On);

    // set the brightness to 100% if on 0% when turned on
    if (!this.service.values.On && 'Brightness' in this.service.values && !this.service.values.Brightness) {
      this.service.getCharacteristic('Brightness').setValue(100);
    }
  }

  onLongClick() {
    if ('Brightness' in this.service.values) {
      const ref = this.modalService.open(LightbulbManageComponent, {
        size: 'sm',
      });
      ref.componentInstance.service = this.service;
    }
  }

}
