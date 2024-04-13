import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-switch',
  templateUrl: './switch.component.html',
  styleUrls: ['./switch.component.scss'],
})
export class SwitchComponent {
  @Input() public service: ServiceTypeX;

  constructor() {}

  onClick() {
    this.service.getCharacteristic('On').setValue(!this.service.values.On);
  }
}
