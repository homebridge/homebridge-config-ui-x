import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-temperaturesensor',
  templateUrl: './temperaturesensor.component.html',
  styleUrls: ['./temperaturesensor.component.scss']
})
export class TemperaturesensorComponent implements OnInit {
  @Input() public service: any;

  constructor() { }

  ngOnInit() {
  }

}
