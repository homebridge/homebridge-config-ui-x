import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input, OnInit } from '@angular/core'

@Component({
  selector: 'app-television',
  templateUrl: './television.component.html',
})
export class TelevisionComponent implements OnInit {
  @Input() public service: ServiceTypeX
  public channelList = {}

  constructor() {}

  ngOnInit() {
    // build inputService list
    for (const [, inputService] of Object.entries(this.service.linkedServices)) {
      this.channelList[inputService.values.Identifier] = inputService.values.ConfiguredName
    }
  }

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
  }
}
