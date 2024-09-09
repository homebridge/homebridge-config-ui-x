import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-contactsensor',
  templateUrl: './contactsensor.component.html',
  styleUrls: ['./contactsensor.component.scss'],
})
export class ContactsensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
