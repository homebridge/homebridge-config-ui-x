import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-leaksensor',
  templateUrl: './leaksensor.component.html',
  styleUrls: ['./leaksensor.component.scss'],
})
export class LeaksensorComponent {
  @Input() public service: ServiceTypeX;

  constructor() {}
}
