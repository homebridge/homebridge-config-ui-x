import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-occupancysensor',
  templateUrl: './occupancysensor.component.html',
  styleUrls: ['./occupancysensor.component.scss'],
})
export class OccupancysensorComponent {
  @Input() public service: ServiceTypeX;

  constructor() {}

  onClick() {
    console.log('short click');
  }

  onLongClick() {
    console.log('long clicked');
  }
}
