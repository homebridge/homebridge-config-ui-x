import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-thermostat',
  templateUrl: './thermostat.component.html',
  styleUrls: ['./thermostat.component.scss']
})
export class ThermostatComponent implements OnInit {
  @Input() public service: any;

  constructor() { }

  ngOnInit() {
  }

}
