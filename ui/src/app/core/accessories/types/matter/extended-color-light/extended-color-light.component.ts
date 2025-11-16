import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ExtendedColorLightManageComponent } from '@/app/core/accessories/types/matter/extended-color-light/extended-color-light.manage.component'
import { getBrightnessPercentage, getDeviceActiveState, getHue, getSaturation, toggleDimmableLight } from '@/app/core/accessories/types/matter/matter-device.utils'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-extended-color-light',
  templateUrl: './extended-color-light.component.html',
  styleUrls: ['./extended-color-light.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class ExtendedColorLightComponent {
  private $accessories = inject(AccessoriesService)
  private $modal = inject(NgbModal)

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

    const ref = this.$modal.open(ExtendedColorLightManageComponent, {
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

  /**
   * Get the light color for the icon
   * Converts Matter HSV (hue 0-254, saturation 0-254) to CSS color
   */
  public get lightColor(): string {
    const hue = getHue(this.service)
    const saturation = getSaturation(this.service)

    // Convert Matter values (0-254) to standard ranges
    const hDegrees = (hue / 254) * 360
    const sPercent = (saturation / 254) * 100

    // Use HSL for CSS - full lightness for vibrant color
    return `hsl(${hDegrees}, ${sPercent}%, 50%)`
  }
}
