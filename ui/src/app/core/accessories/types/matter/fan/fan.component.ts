import {
  ChangeDetectionStrategy,
  Component,
  computed,
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  input,
} from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { MatterFanManageComponent } from '@/app/core/accessories/types/matter/fan/fan.manage.component'
import { getFanPercentSetting, isFanOn, toggleFan } from '@/app/core/accessories/types/matter/matter-device.utils'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-matter-fan',
  templateUrl: './fan.component.html',
  styleUrl: './fan.component.scss',
  standalone: true,
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
})
export class MatterFanComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    void toggleFan(this.service())
  }

  public onLongClick() {
    if (!this.readyForControl()) {
      return
    }

    const modalInjector = createEnvironmentInjector(
      [{
        provide: ACCESSORY_MANAGE_MODAL_DATA,
        useValue: {
          service: this.service(),
          $accessories: this.$accessories,
        },
      }],
      this.injector,
    )

    this.$modal.open(MatterFanManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }

  public readonly isOn = computed(() => isFanOn(this.service()))

  public readonly fanSpeed = computed(() => getFanPercentSetting(this.service()))
}
