import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { DimmableLightManageComponent } from '@/app/core/accessories/types/matter/dimmable-light/dimmable-light.manage.component'
import { getBrightnessPercentage, getDeviceActiveState, toggleDimmableLight } from '@/app/core/accessories/types/matter/matter-device.utils'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-dimmable-light',
  templateUrl: './dimmable-light.component.html',
  styleUrls: ['./dimmable-light.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class DimmableLightComponent {
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

    const ref = this.$modal.open(DimmableLightManageComponent, {
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
}
