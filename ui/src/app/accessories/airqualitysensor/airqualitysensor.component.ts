import { Component, OnInit, Input } from '@angular/core';
import { ServiceType } from '@oznu/hap-client';

@Component({
  selector: 'app-airqualitysensor',
  templateUrl: './airqualitysensor.component.html',
  styleUrls: ['./airqualitysensor.component.scss']
})
export class AirqualitysensorComponent implements OnInit {
  @Input() public service: ServiceType;

  public labels = ['Unknown', 'Excellent', 'Good', 'Fair', 'Inferior', 'Poor'];

  constructor() { }

  ngOnInit() {
  }

}
