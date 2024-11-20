import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

@Component({
  selector: 'app-statelessprogrammableswitch',
  templateUrl: './statelessprogrammableswitch.component.html',
  imports: [InlineSVGModule],
})
export class StatelessprogrammableswitchComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
