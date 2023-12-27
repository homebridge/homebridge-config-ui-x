import { Component, Input, OnInit } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-temperaturesensor',
  templateUrl: './temperaturesensor.component.html',
  styleUrls: ['./temperaturesensor.component.scss'],
})
export class TemperaturesensorComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor() {}

  ngOnInit() {}
}
