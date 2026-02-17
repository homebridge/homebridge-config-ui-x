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
import { ColorTemperatureLightManageComponent } from '@/app/core/accessories/types/matter/color-temperature-light/color-temperature-light.manage.component'
import { getBrightnessPercentage, getDeviceActiveState, toggleDimmableLight } from '@/app/core/accessories/types/matter/matter-device.utils'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'
import { ColourService } from '@/app/core/utilities/colour.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-color-temperature-light',
  templateUrl: './color-temperature-light.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
})
export class ColorTemperatureLightComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)
  public $colour = inject(ColourService)

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

    this.$modal.open(ColorTemperatureLightManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }

  public isOn = computed(() => getDeviceActiveState(this.service()))

  public brightness = computed(() => getBrightnessPercentage(this.service()))

  protected readonly Math = Math
}
