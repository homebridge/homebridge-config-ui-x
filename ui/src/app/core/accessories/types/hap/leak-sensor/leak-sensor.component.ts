import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-leak-sensor',
  templateUrl: './leak-sensor.component.html',
  styleUrls: ['./leak-sensor.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class LeakSensorComponent {
  @Input() public service: ServiceTypeX
}
