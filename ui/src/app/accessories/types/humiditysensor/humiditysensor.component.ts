import { Component, OnInit, Input } from '@angular/core';
import { ServiceType } from '@oznu/hap-client';

@Component({
  selector: 'app-humiditysensor',
  templateUrl: './humiditysensor.component.html',
  styleUrls: ['./humiditysensor.component.scss']
})
export class HumiditysensorComponent implements OnInit {
  @Input() public service: ServiceType;

  constructor() { }

  ngOnInit() {
  }

}
