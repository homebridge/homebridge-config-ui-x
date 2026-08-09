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
import { getBrightnessPercentage, getColorMode, getColorTemperatureMireds, getDeviceActiveState, getHue, getSaturation, hasClusterFeature, hasColorTemperature, toggleDimmableLight } from '@/app/core/accessories/types/matter/matter-device.utils'
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
   *
   * ⚠️ A plugin can compose ColorControl with only some of its features, so an
   * extended colour light may have no HueSaturation at all. Reading hue and
   * saturation there gave 0 and 0, painting the bulb flat grey. Falls through
   * to colour temperature and then to the warm default the other light tiles
   * use, matching how the HAP lightbulb tile picks its fill.
   */
  public readonly lightColor = computed(() => {
    const service = this.service()
    const hasHueSaturation = hasClusterFeature(
      service,
      'colorControl',
      'hueSaturation',
      service.clusters?.colorControl?.currentHue !== undefined,
    )
    const hasColorTemp = hasClusterFeature(
      service,
      'colorControl',
      'colorTemperature',
      hasColorTemperature(service),
    )

    // Color temperature mode, or a light that can only do color temperature
    if (hasColorTemp && (getColorMode(service) === 2 || !hasHueSaturation)) {
      const mireds = getColorTemperatureMireds(service)
      return this.$colour.kelvinToHex(this.$colour.miredToKelvin(mireds))
    }

    if (hasHueSaturation) {
      // Convert Matter values (0-254) to standard ranges
      return this.$colour.hueSaturationToHsl(
        (getHue(service) / 254) * 360,
        (getSaturation(service) / 254) * 100,
      )
    }

    return '#ffcf55'
  })
}
