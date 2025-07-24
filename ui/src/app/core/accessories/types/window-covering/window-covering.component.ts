import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { WindowCoveringManageComponent } from '@/app/core/accessories/types/window-covering/window-covering.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-window-covering',
  templateUrl: './window-covering.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGDirective,
    TranslatePipe,
  ],
})
export class WindowCoveringComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    if (this.service.values.TargetPosition) {
      this.service.getCharacteristic('TargetPosition').setValue(0)
    } else {
      this.service.getCharacteristic('TargetPosition').setValue(100)
    }
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
  }
}
