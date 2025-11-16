import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { MatterFanManageComponent } from '@/app/core/accessories/types/matter/fan/fan.manage.component'
import { getFanPercentSetting, isFanOn, toggleFan } from '@/app/core/accessories/types/matter/matter-device.utils'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-matter-fan',
  templateUrl: './fan.component.html',
  styleUrls: ['./fan.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class MatterFanComponent {
  private $accessories = inject(AccessoriesService)
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    toggleFan(this.service)
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    const ref = this.$modal.open(MatterFanManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
    ref.componentInstance.$accessories = this.$accessories
  }

  public get isOn(): boolean {
    return isFanOn(this.service)
  }

  public get fanSpeed(): number {
    return getFanPercentSetting(this.service)
  }
}
