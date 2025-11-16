import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-smoke-sensor',
  templateUrl: './smoke-sensor.component.html',
  styleUrls: ['./smoke-sensor.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class SmokeSensorComponent {
  @Input() public service: ServiceTypeX
}
