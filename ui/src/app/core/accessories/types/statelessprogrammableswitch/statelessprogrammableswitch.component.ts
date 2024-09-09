import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-statelessprogrammableswitch',
  templateUrl: './statelessprogrammableswitch.component.html',
})
export class StatelessprogrammableswitchComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
