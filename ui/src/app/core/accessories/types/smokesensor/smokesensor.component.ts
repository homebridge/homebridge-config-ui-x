import { Component, Input, OnInit } from '@angular/core';
import { ServiceTypeX } from '../../accessories.interfaces';

@Component({
  selector: 'app-smokesensor',
  templateUrl: './smokesensor.component.html',
  styleUrls: ['./smokesensor.component.scss'],
})
export class SmokesensorComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor() {}

  ngOnInit() {}
}
