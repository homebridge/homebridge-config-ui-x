import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-airqualitysensor',
  templateUrl: './airqualitysensor.component.html',
})
export class AirqualitysensorComponent {
  @Input() public service: ServiceTypeX

  public labels = ['Unknown', 'Excellent', 'Good', 'Fair', 'Inferior', 'Poor']

  constructor() {}
}
