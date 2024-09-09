import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-lightsensor',
  templateUrl: './lightsensor.component.html',
})
export class LightsensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
