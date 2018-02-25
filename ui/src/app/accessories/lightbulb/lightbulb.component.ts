import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-lightbulb',
  templateUrl: './lightbulb.component.html',
  styleUrls: ['./lightbulb.component.scss']
})
export class LightbulbComponent implements OnInit {
  @Input() public service: any;

  constructor() { }

  ngOnInit() {
  }

  onClick() {
    this.service.getCharacteristic('On').setValue(!this.service.values.On);
  }

}
