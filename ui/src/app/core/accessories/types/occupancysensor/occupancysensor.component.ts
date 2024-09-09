import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-occupancysensor',
  templateUrl: './occupancysensor.component.html',
  styleUrls: ['./occupancysensor.component.scss'],
})
export class OccupancysensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}

  onClick() {
    // eslint-disable-next-line no-console
    console.log('short click')
  }

  onLongClick() {
    // eslint-disable-next-line no-console
    console.log('long clicked')
  }
}
