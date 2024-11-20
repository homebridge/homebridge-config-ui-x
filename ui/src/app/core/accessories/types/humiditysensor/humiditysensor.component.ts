import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-humiditysensor',
  templateUrl: './humiditysensor.component.html',
  styleUrls: ['./humiditysensor.component.scss'],
  standalone: true,
})
export class HumiditysensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
