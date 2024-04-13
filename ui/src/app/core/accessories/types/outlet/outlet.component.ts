import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-outlet',
  templateUrl: './outlet.component.html',
  styleUrls: ['./outlet.component.scss'],
})
export class OutletComponent {
  @Input() public service: ServiceTypeX;

  constructor() {}

  onClick() {
    this.service.getCharacteristic('On').setValue(!this.service.values.On);
  }
}
