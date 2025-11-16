import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ColorTemperatureLightManageComponent } from '@/app/core/accessories/types/matter/color-temperature-light/color-temperature-light.manage.component'
import { getBrightnessPercentage, getDeviceActiveState, toggleDimmableLight } from '@/app/core/accessories/types/matter/matter-device.utils'
import { ColourService } from '@/app/core/colour.service'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-color-temperature-light',
  templateUrl: './color-temperature-light.component.html',
  styleUrls: ['./color-temperature-light.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class ColorTemperatureLightComponent {
  private $accessories = inject(AccessoriesService)
  private $modal = inject(NgbModal)
  public $colour = inject(ColourService)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      return
    }
    toggleDimmableLight(this.service)
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    const ref = this.$modal.open(ColorTemperatureLightManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
    ref.componentInstance.$accessories = this.$accessories
  }

  public get isOn(): boolean {
    return getDeviceActiveState(this.service)
  }

  public get brightness(): number {
    return getBrightnessPercentage(this.service)
  }

  public kelvinToHex(kelvin: number): string {
    // Clamp kelvin to the valid range
    kelvin = Math.max(1000, Math.min(40000, kelvin))
    const temp = kelvin / 100
    let red, green, blue

    if (temp <= 66) {
      red = 255
      green = temp
      green = 99.4708025861 * Math.log(green) - 161.1195681661
      blue = temp <= 19 ? 0 : (138.5177312231 * Math.log(temp - 10) - 305.0447927307)
    } else {
      red = 329.698727446 * (temp - 60) ** -0.1332047592
      green = 288.1221695283 * (temp - 60) ** -0.0755148492
      blue = 255
    }

    red = Math.round(Math.min(Math.max(red, 0), 255))
    green = Math.round(Math.min(Math.max(green, 0), 255))
    blue = Math.round(Math.min(Math.max(blue, 0), 255))

    return (
      `#${
        red.toString(16).padStart(2, '0')
      }${green.toString(16).padStart(2, '0')
      }${blue.toString(16).padStart(2, '0')}`
    )
  }

  protected readonly Math = Math
}
