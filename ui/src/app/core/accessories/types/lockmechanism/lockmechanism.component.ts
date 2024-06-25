import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-lockmechanism',
  templateUrl: './lockmechanism.component.html',
  styleUrls: ['./lockmechanism.component.scss'],
})
export class LockmechanismComponent {
  @Input() public service: ServiceTypeX;

  constructor() {}

  onClick() {
    this.service.getCharacteristic('LockTargetState').setValue(this.service.values.LockTargetState ? 0 : 1);
  }
}
