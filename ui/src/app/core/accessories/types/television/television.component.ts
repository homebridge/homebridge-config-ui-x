import { Component, OnInit, Input } from '@angular/core';
import { ServiceTypeX } from '../../accessories.interfaces';

@Component({
  selector: 'app-television',
  templateUrl: './television.component.html',
  styleUrls: ['./television.component.scss'],
})
export class TelevisionComponent implements OnInit {
  @Input() public service: ServiceTypeX;
  public channelList = {};

  constructor() { }

  ngOnInit() {
    // build inputService list
    for (const [iid, inputService] of Object.entries(this.service.linkedServices)) {
      this.channelList[inputService.values.Identifier] = inputService.values.ConfiguredName;
    }
  }

  onClick() {
    this.service.getCharacteristic('Active').setValue(!this.service.values.Active);
  }

}
