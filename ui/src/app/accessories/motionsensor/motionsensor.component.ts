import { Component, OnInit, Input } from '@angular/core';
import { ServiceType } from '@oznu/hap-client';

@Component({
  selector: 'app-motionsensor',
  templateUrl: './motionsensor.component.html',
  styleUrls: ['./motionsensor.component.scss']
})
export class MotionsensorComponent implements OnInit {
  @Input() public service: ServiceType;

  constructor() { }

  ngOnInit() {
  }

}
