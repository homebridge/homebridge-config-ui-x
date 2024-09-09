import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-unknown',
  templateUrl: './unknown.component.html',
})
export class UnknownComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
