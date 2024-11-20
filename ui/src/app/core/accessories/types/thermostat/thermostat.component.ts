import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ThermostatManageComponent } from '@/app/core/accessories/types/thermostat/thermostat.manage.component'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { DecimalPipe, NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { LongClickDirective } from '../../../directives/longclick.directive'

@Component({
  selector: 'app-thermostat',
  templateUrl: './thermostat.component.html',
  styleUrls: ['./thermostat.component.scss'],
  imports: [
    LongClickDirective,
    NgClass,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
  ],
})
export class ThermostatComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  model = 1

  onClick() {
    const ref = this.$modal.open(ThermostatManageComponent, {
      size: 'sm',
    })
    ref.componentInstance.service = this.service
  }
}
