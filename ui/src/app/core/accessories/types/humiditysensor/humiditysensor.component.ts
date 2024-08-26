import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-humiditysensor',
  templateUrl: './humiditysensor.component.html',
  styleUrls: ['./humiditysensor.component.scss'],
})
export class HumiditysensorComponent {
  @Input() public service: ServiceTypeX;

  constructor() {}
}
