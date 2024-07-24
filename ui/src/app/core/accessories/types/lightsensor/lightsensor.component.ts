import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-lightsensor',
  templateUrl: './lightsensor.component.html',
  styleUrls: ['./lightsensor.component.scss'],
})
export class LightsensorComponent {
  @Input() public service: ServiceTypeX;

  constructor() {}
}
