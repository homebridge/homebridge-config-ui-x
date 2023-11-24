import { Component, Input, OnInit } from '@angular/core';
import { ServiceTypeX } from '../../accessories.interfaces';

@Component({
  selector: 'app-lightsensor',
  templateUrl: './lightsensor.component.html',
  styleUrls: ['./lightsensor.component.scss'],
})
export class LightsensorComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor() {}

  ngOnInit() {
  }
}
