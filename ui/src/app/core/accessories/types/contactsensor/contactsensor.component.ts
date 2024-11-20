import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

@Component({
  selector: 'app-contactsensor',
  templateUrl: './contactsensor.component.html',
  styleUrls: ['./contactsensor.component.scss'],
  imports: [
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class ContactsensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
