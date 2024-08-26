import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-battery',
  templateUrl: './battery.component.html',
  styleUrls: ['./battery.component.scss'],
})
export class BatteryComponent {
  @Input() public service: ServiceTypeX;

  constructor() {}
}
