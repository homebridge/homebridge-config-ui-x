import { Component, input } from '@angular/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-matter-unknown',
  templateUrl: './unknown.component.html',
  standalone: true,
})
export class MatterUnknownComponent {
  public service = input.required<ServiceTypeX>()
}
