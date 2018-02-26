import { Component, OnInit, Input } from '@angular/core';
import { ServiceType } from '@oznu/hap-client';

@Component({
  selector: 'app-lockmechanism',
  templateUrl: './lockmechanism.component.html',
  styleUrls: ['./lockmechanism.component.scss']
})
export class LockmechanismComponent implements OnInit {
  @Input() public service: ServiceType;

  constructor() { }

  ngOnInit() {
  }

  onClick() {
    this.service.getCharacteristic('LockTargetState').setValue(!this.service.values.LockTargetState);
  }

}
