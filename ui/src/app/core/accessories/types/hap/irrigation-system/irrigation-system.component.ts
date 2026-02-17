import { Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-irrigation-system',
  templateUrl: './irrigation-system.component.html',
  styleUrl: './irrigation-system.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class IrrigationSystemComponent {
  public service = input.required<ServiceTypeX>()
}
