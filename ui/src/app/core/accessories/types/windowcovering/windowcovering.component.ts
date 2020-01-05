import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../../accessories.interfaces';

import { WindowcoveringManageComponent } from './windowcovering.manage.component';

@Component({
  selector: 'app-windowcovering',
  templateUrl: './windowcovering.component.html',
  styleUrls: ['./windowcovering.component.scss'],
})
export class WindowcoveringComponent implements OnInit {
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
    const ref = this.modalService.open(WindowcoveringManageComponent, {
      size: 'sm',
    });
    ref.componentInstance.service = this.service;
  }

}
