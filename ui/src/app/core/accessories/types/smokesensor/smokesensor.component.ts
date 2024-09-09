import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-smokesensor',
  templateUrl: './smokesensor.component.html',
  styleUrls: ['./smokesensor.component.scss'],
})
export class SmokesensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
