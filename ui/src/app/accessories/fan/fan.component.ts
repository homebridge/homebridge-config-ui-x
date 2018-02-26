import { Component, OnInit, Input } from '@angular/core';
import { ServiceType } from '@oznu/hap-client';

@Component({
  selector: 'app-fan',
  templateUrl: './fan.component.html',
  styleUrls: ['./fan.component.scss']
})
export class FanComponent implements OnInit {
  @Input() public service: ServiceType;

  constructor() { }

  ngOnInit() {
  }

  onClick() {
    this.service.getCharacteristic('On').setValue(!this.service.values.On);
  }

}
