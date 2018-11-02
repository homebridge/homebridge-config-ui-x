import { Component, OnInit, Input } from '@angular/core';
import { ServiceTypeX } from '../../accessories.component';

@Component({
  selector: 'app-temperaturesensor',
  templateUrl: './temperaturesensor.component.html',
  styleUrls: ['./temperaturesensor.component.scss']
})
export class TemperaturesensorComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor() { }

  ngOnInit() {
  }

}
