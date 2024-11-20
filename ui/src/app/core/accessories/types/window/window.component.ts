import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { WindowManageComponent } from '@/app/core/accessories/types/window/window.manage.component'
import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'
import { LongClickDirective } from '../../../directives/longclick.directive'

@Component({
  selector: 'app-window',
  templateUrl: './window.component.html',
  styleUrls: ['./window.component.scss'],
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class WindowComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX

  onClick() {
    if (this.service.values.TargetPosition) {
      this.service.getCharacteristic('TargetPosition').setValue(0)
    } else {
      this.service.getCharacteristic('TargetPosition').setValue(100)
    }
  }

  onLongClick() {
    const ref = this.$modal.open(WindowManageComponent, {
      size: 'md',
    })
    ref.componentInstance.service = this.service
  }
}
