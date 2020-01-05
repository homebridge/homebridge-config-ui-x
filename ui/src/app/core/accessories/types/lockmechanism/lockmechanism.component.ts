import { Component, OnInit, Input } from '@angular/core';
import { ServiceTypeX } from '../../accessories.interfaces';

@Component({
  selector: 'app-lockmechanism',
  templateUrl: './lockmechanism.component.html',
  styleUrls: ['./lockmechanism.component.scss'],
})
export class LockmechanismComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor() { }

  ngOnInit() {
  }

  onClick() {
    this.service.getCharacteristic('LockTargetState').setValue(!this.service.values.LockTargetState);
  }

}
