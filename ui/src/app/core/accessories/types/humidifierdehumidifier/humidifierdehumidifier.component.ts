import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { HumidifierDehumidifierManageComponent } from '@/app/core/accessories/types/humidifierdehumidifier/humidifierdehumidifier.manage.component'
import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { LongClickDirective } from '../../../directives/longclick.directive'

@Component({
  selector: 'app-humidifierdehumidifier',
  templateUrl: './humidifierdehumidifier.component.html',
  styleUrls: ['./humidifierdehumidifier.component.scss'],
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class HumidifierDehumidifierComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  model = 1

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
  }

  onLongClick() {
    const ref = this.$modal.open(HumidifierDehumidifierManageComponent, {
      size: 'sm',
    })
    ref.componentInstance.service = this.service
  }
}
