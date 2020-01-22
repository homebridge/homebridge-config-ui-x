import { Component, OnInit, Input } from '@angular/core';
import { ServiceTypeX } from '../../accessories.interfaces';

@Component({
  selector: 'app-batteryservice',
  templateUrl: './batteryservice.component.html',
  styleUrls: ['./batteryservice.component.scss'],
})
export class BatteryserviceComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor() { }

  ngOnInit() {
  }
}
