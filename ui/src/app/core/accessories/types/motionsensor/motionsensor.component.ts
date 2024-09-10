import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-motionsensor',
  templateUrl: './motionsensor.component.html',
  styleUrls: ['./motionsensor.component.scss'],
})
export class MotionsensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
