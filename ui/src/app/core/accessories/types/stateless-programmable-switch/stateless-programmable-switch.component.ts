import { Component, Input } from '@angular/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-stateless-programmable-switch',
  templateUrl: './stateless-programmable-switch.component.html',
  standalone: true,
  imports: [InlineSVGDirective],
})
export class StatelessProgrammableSwitchComponent {
  @Input() public service: ServiceTypeX
}
