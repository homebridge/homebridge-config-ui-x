import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-contactsensor',
  templateUrl: './contactsensor.component.html',
  styleUrls: ['./contactsensor.component.scss'],
})
export class ContactsensorComponent {
  @Input() public service: ServiceTypeX;

  constructor() {}
}
