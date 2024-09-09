import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-leaksensor',
  templateUrl: './leaksensor.component.html',
  styleUrls: ['./leaksensor.component.scss'],
})
export class LeaksensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
