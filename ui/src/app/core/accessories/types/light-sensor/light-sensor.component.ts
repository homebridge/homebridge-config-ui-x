import { DecimalPipe } from '@angular/common'
import { Component, Input } from '@angular/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-light-sensor',
  templateUrl: './light-sensor.component.html',
  standalone: true,
  imports: [
    InlineSVGDirective,
    DecimalPipe,
  ],
})
export class LightSensorComponent {
  @Input() public service: ServiceTypeX
}
