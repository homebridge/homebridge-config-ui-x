import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-outlet',
  templateUrl: './outlet.component.html',
})
export class OutletComponent {
  @Input() public service: ServiceTypeX

  constructor() {}

  onClick() {
    this.service.getCharacteristic('On').setValue(!this.service.values.On)
  }
}
