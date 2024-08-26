import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-garagedooropener',
  templateUrl: './garagedooropener.component.html',
  styleUrls: ['./garagedooropener.component.scss'],
})
export class GaragedooropenerComponent {
  @Input() public service: ServiceTypeX;

  constructor() {}

  onClick() {
    this.service.getCharacteristic('TargetDoorState').setValue(this.service.values.TargetDoorState ? 0 : 1);
  }
}
