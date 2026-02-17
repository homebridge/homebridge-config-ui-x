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
import { DimmableLightManageComponent } from '@/app/core/accessories/types/matter/dimmable-light/dimmable-light.manage.component'
import { getBrightnessPercentage, getDeviceActiveState, toggleDimmableLight } from '@/app/core/accessories/types/matter/matter-device.utils'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dimmable-light',
  templateUrl: './dimmable-light.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
})
export class DimmableLightComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public service = input.required<ServiceTypeX>()
  public readyForControl = input<boolean>(false)

  public onClick() {
    if (!this.readyForControl()) {
      return
    }
    void toggleDimmableLight(this.service())
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

    this.$modal.open(DimmableLightManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }

  public isOn = computed(() => getDeviceActiveState(this.service()))

  public brightness = computed(() => getBrightnessPercentage(this.service()))
}
