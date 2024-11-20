import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

@Component({
  selector: 'app-unknown',
  templateUrl: './unknown.component.html',
  imports: [InlineSVGModule],
})
export class UnknownComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
