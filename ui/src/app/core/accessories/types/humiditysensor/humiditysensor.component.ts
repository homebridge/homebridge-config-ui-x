import { Component, Input, OnInit } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-humiditysensor',
  templateUrl: './humiditysensor.component.html',
  styleUrls: ['./humiditysensor.component.scss'],
})
export class HumiditysensorComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor() {}

  ngOnInit() {}
}
