import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { isWaterValveOpen, toggleWaterValve } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-water-valve',
  imports: [
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './water-valve.component.html',
  styleUrl: './water-valve.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterWaterValveComponent {
  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public readonly isOpen = computed(() => isWaterValveOpen(this.service()))

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    void toggleWaterValve(this.service())
  }
}
