import { Component, Input, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';
import { HumidifierDehumidifierManageComponent } from '@/app/core/accessories/types/humidifierdehumidifier/humidifierdehumidifier.manage.component'; // eslint-disable-line max-len

@Component({
  selector: 'app-humidifierdehumidifier',
  templateUrl: './humidifierdehumidifier.component.html',
  styleUrls: ['./humidifierdehumidifier.component.scss'],
})
export class HumidifierDehumidifierComponent implements OnInit {
  @Input() public service: ServiceTypeX;
  model = 1;

  constructor(
    private modalService: NgbModal,
  ) {}

  ngOnInit() {}

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1);
  }

  onLongClick() {
    const ref = this.modalService.open(HumidifierDehumidifierManageComponent, {
      size: 'sm',
    });
    ref.componentInstance.service = this.service;
  }
}
