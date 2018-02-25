import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-occupancysensor',
  templateUrl: './occupancysensor.component.html',
  styleUrls: ['./occupancysensor.component.scss']
})
export class OccupancysensorComponent implements OnInit {
  @Input() public service: any;

  constructor() { }

  ngOnInit() {
  }

}
