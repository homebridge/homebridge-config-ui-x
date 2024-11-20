import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { DecimalPipe } from '@angular/common'
import { Component, Input } from '@angular/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

@Component({
  selector: 'app-lightsensor',
  templateUrl: './lightsensor.component.html',
  imports: [
    InlineSVGModule,
    DecimalPipe,
  ],
})
export class LightsensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
