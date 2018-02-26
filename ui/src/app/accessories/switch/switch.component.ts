import { Component, OnInit, Input } from '@angular/core';
import { ServiceType } from '@oznu/hap-client';

@Component({
  selector: 'app-switch',
  templateUrl: './switch.component.html',
  styleUrls: ['./switch.component.scss']
})
export class SwitchComponent implements OnInit {
  @Input() public service: ServiceType;

  constructor() {}

  ngOnInit() {
  }

  onClick() {
    this.service.getCharacteristic('On').setValue(!this.service.values.On);
  }

}
