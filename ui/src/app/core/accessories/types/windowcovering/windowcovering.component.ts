import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { WindowcoveringManageComponent } from '@/app/core/accessories/types/windowcovering/windowcovering.manage.component'
import { LongClickDirective } from '@/app/core/directives/longclick.directive'

@Component({
  selector: 'app-windowcovering',
  templateUrl: './windowcovering.component.html',
  styleUrls: ['./windowcovering.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class WindowCoveringComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX

  constructor() {}

  onClick() {
    if (this.service.values.TargetPosition) {
      this.service.getCharacteristic('TargetPosition').setValue(0)
    } else {
      this.service.getCharacteristic('TargetPosition').setValue(100)
    }
  }

  onLongClick() {
    const ref = this.$modal.open(WindowcoveringManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
  }
}
