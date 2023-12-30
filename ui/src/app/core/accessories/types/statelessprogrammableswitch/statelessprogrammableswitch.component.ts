import { Component, Input, OnInit } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-statelessprogrammableswitch',
  templateUrl: './statelessprogrammableswitch.component.html',
  styleUrls: ['./statelessprogrammableswitch.component.scss'],
})
export class StatelessprogrammableswitchComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor() {}

  ngOnInit() {}
}
