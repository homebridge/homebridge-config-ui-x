import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { HeaterCoolerManageComponent } from '@/app/core/accessories/types/heatercooler/heatercooler.manage.component'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { DecimalPipe, NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { LongClickDirective } from '../../../directives/longclick.directive'

@Component({
  selector: 'app-heatercooler',
  templateUrl: './heatercooler.component.html',
  styleUrls: ['./heatercooler.component.scss'],
  imports: [
    LongClickDirective,
    NgClass,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
  ],
})
export class HeaterCoolerComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  model = 1

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
  }

  onLongClick() {
    const ref = this.$modal.open(HeaterCoolerManageComponent, {
      size: 'sm',
    })
    ref.componentInstance.service = this.service
  }
}
