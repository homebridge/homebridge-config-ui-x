import { Component, OnInit, Input } from '@angular/core';
import { ServiceType } from '@oznu/hap-client';

@Component({
  selector: 'app-temperaturesensor',
  templateUrl: './temperaturesensor.component.html',
  styleUrls: ['./temperaturesensor.component.scss']
})
export class TemperaturesensorComponent implements OnInit {
  @Input() public service: ServiceType;

  constructor() { }

  ngOnInit() {
  }

}
