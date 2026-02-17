import { Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getWaterLeakState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-water-leak-detector',
  templateUrl: './water-leak-detector.component.html',
  styleUrl: './water-leak-detector.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class MatterWaterLeakDetectorComponent {
  public service = input.required<ServiceTypeX>()

  public isLeaking = computed(() => getWaterLeakState(this.service()))
}
