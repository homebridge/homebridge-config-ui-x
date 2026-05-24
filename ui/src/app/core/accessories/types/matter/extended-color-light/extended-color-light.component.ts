import { LowerCasePipe } from '@angular/common'
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
import { ExtendedColorLightManageComponent } from '@/app/core/accessories/types/matter/extended-color-light/extended-color-light.manage.component'
import { getBrightnessPercentage, getColorMode, getColorTemperatureMireds, getDeviceActiveState, getHue, getSaturation, toggleDimmableLight } from '@/app/core/accessories/types/matter/matter-device.utils'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'
import { ColourService } from '@/app/core/utilities/colour.service'

@Component({
  selector: 'app-extended-color-light',
  imports: [
    LongClickDirective,
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './extended-color-light.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtendedColorLightComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)
  private $colour = inject(ColourService)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

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

    this.$modal.open(ExtendedColorLightManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }

  public readonly isOn = computed(() => getDeviceActiveState(this.service()))

  public readonly brightness = computed(() => getBrightnessPercentage(this.service()))

  /**
   * Get the light color for the icon
   * Uses color temperature when in CT mode (colorMode=2), otherwise hue/saturation
   */
  public readonly lightColor = computed(() => {
    const colorMode = getColorMode(this.service())

    // Color temperature mode
    if (colorMode === 2) {
      const mireds = getColorTemperatureMireds(this.service())
      return this.$colour.kelvinToHex(this.$colour.miredToKelvin(mireds))
    }

    // Hue/Saturation mode
    const hue = getHue(this.service())
    const saturation = getSaturation(this.service())

    // Convert Matter values (0-254) to standard ranges
    const hDegrees = (hue / 254) * 360
    const sPercent = (saturation / 254) * 100

    // Use HSL for CSS - full lightness for vibrant color
    return `hsl(${hDegrees}, ${sPercent}%, 50%)`
  })
}
