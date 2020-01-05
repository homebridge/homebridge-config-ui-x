import { Component, OnInit, Input } from '@angular/core';
import { ServiceTypeX } from '../../accessories.interfaces';

@Component({
  selector: 'app-humiditysensor',
  templateUrl: './humiditysensor.component.html',
  styleUrls: ['./humiditysensor.component.scss'],
})
export class HumiditysensorComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor() { }

  ngOnInit() {
  }

}
