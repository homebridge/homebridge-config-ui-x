import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-lockmechanism',
  templateUrl: './lockmechanism.component.html',
  styleUrls: ['./lockmechanism.component.scss']
})
export class LockmechanismComponent implements OnInit {
  @Input() public service: any;

  constructor() { }

  ngOnInit() {
  }

  onClick() {
    this.service.getCharacteristic('LockTargetState').setValue(!this.service.values.LockTargetState);
  }

}
