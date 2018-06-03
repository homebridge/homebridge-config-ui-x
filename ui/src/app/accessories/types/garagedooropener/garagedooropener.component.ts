import { Component, OnInit, Input } from '@angular/core';
import { ServiceType } from '@oznu/hap-client';

@Component({
  selector: 'app-garagedooropener',
  templateUrl: './garagedooropener.component.html',
  styleUrls: ['./garagedooropener.component.scss']
})
export class GaragedooropenerComponent implements OnInit {
  @Input() public service: ServiceType;

  constructor() { }

  ngOnInit() {
  }

  onClick() {
    this.service.getCharacteristic('TargetDoorState').setValue(!this.service.values.TargetDoorState);
  }

}
