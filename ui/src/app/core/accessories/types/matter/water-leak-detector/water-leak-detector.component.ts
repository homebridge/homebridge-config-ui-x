import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getWaterLeakState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-water-leak-detector',
  templateUrl: './water-leak-detector.component.html',
  styleUrls: ['./water-leak-detector.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class MatterWaterLeakDetectorComponent {
  @Input() public service: ServiceTypeX

  public get isLeaking(): boolean {
    return getWaterLeakState(this.service)
  }
}
