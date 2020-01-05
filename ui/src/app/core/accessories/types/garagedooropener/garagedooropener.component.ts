import { Component, OnInit, Input } from '@angular/core';
import { ServiceTypeX } from '../../accessories.interfaces';

@Component({
  selector: 'app-garagedooropener',
  templateUrl: './garagedooropener.component.html',
  styleUrls: ['./garagedooropener.component.scss'],
})
export class GaragedooropenerComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor() { }

  ngOnInit() {
  }

  onClick() {
    this.service.getCharacteristic('TargetDoorState').setValue(!this.service.values.TargetDoorState);
  }

}
