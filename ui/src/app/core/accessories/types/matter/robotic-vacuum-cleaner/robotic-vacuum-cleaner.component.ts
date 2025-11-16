import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { controlDevice, getDeviceActiveState, getDeviceStatusText, isOnOffDevice } from '@/app/core/accessories/types/matter/matter-device.utils'
import { RoboticVacuumCleanerManageComponent } from '@/app/core/accessories/types/matter/robotic-vacuum-cleaner/robotic-vacuum-cleaner.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-robotic-vacuum-cleaner',
  templateUrl: './robotic-vacuum-cleaner.component.html',
  styleUrls: ['./robotic-vacuum-cleaner.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class RoboticVacuumCleanerComponent {
  private $accessories = inject(AccessoriesService)
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      console.warn('Robotic vacuum: Not ready for control')
      return
    }

    controlDevice(this.service)
  }

  public onLongClick() {
    if (!this.readyForControl || !this.canShowModal) {
      return
    }

    const ref = this.$modal.open(RoboticVacuumCleanerManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
    ref.componentInstance.$accessories = this.$accessories
  }

  public get isActive(): boolean {
    return getDeviceActiveState(this.service)
  }

  public get statusText(): string {
    return getDeviceStatusText(this.service)
  }

  public get canShowModal(): boolean {
    return !isOnOffDevice(this.service)
  }
}
