import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-batteryservice',
  templateUrl: './batteryservice.component.html',
  styleUrls: ['./batteryservice.component.scss'],
})
export class BatteryserviceComponent {
  @Input() public service: ServiceTypeX;

  constructor() {}
}
