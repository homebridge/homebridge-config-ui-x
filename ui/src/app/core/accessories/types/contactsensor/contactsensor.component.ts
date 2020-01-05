import { Component, OnInit, Input } from '@angular/core';
import { ServiceTypeX } from '../../accessories.interfaces';

@Component({
  selector: 'app-contactsensor',
  templateUrl: './contactsensor.component.html',
  styleUrls: ['./contactsensor.component.scss'],
})
export class ContactsensorComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor() { }

  ngOnInit() {
  }

}
