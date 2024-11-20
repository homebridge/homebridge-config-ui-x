import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { DecimalPipe, NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  selector: 'app-battery',
  templateUrl: './battery.component.html',
  styleUrls: ['./battery.component.scss'],
  imports: [
    NgClass,
    DecimalPipe,
    TranslatePipe,
  ],
})
export class BatteryComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
