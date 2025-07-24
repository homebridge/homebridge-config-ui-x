import { Component, Input } from '@angular/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-unknown',
  templateUrl: './unknown.component.html',
  standalone: true,
  imports: [InlineSVGDirective],
})
export class UnknownComponent {
  @Input() public service: ServiceTypeX
}
