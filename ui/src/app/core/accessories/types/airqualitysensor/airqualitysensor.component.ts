import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

@Component({
  selector: 'app-airqualitysensor',
  templateUrl: './airqualitysensor.component.html',
  imports: [NgClass, InlineSVGModule],
})
export class AirqualitysensorComponent {
  @Input() public service: ServiceTypeX

  public labels = ['Unknown', 'Excellent', 'Good', 'Fair', 'Inferior', 'Poor']

  constructor() {}
}
