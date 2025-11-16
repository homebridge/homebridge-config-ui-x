import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { getWindowCoveringPercentage, toggleWindowCovering } from '@/app/core/accessories/types/matter/matter-device.utils'
import { WindowCoveringManageComponent } from '@/app/core/accessories/types/matter/window-covering/window-covering.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-matter-window-covering',
  templateUrl: './window-covering.component.html',
  styleUrls: ['./window-covering.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class MatterWindowCoveringComponent {
  private $accessories = inject(AccessoriesService)
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    toggleWindowCovering(this.service)
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    const ref = this.$modal.open(WindowCoveringManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
    ref.componentInstance.$accessories = this.$accessories
  }

  public get currentPosition(): number {
    return getWindowCoveringPercentage(this.service)
  }

  public get deviceType(): string {
    return this.service.customType || this.service.deviceType || 'WindowCovering'
  }

  public get isWindowCovering(): boolean {
    return this.deviceType === 'WindowCovering'
  }

  public get isDoor(): boolean {
    return this.deviceType === 'Door'
  }

  public get isWindow(): boolean {
    return this.deviceType === 'Window'
  }
}
