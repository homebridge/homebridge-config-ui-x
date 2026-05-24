import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getWaterLeakState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-water-leak-detector',
  imports: [
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './water-leak-detector.component.html',
  styleUrl: './water-leak-detector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterWaterLeakDetectorComponent {
  public readonly service = input.required<ServiceTypeX>()

  public readonly isLeaking = computed(() => getWaterLeakState(this.service()))
}
