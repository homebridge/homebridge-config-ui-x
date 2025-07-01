import { DecimalPipe, NgClass, UpperCasePipe } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { HeaterCoolerManageComponent } from '@/app/core/accessories/types/heatercooler/heatercooler.manage.component'
import { LongClickDirective } from '@/app/core/directives/longclick.directive'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  selector: 'app-heatercooler',
  templateUrl: './heatercooler.component.html',
  styleUrls: ['./heatercooler.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
    UpperCasePipe,
  ],
})
export class HeaterCoolerComponent {
  private $modal = inject(NgbModal)
  $settings = inject(SettingsService)

  @Input() public service: ServiceTypeX
  model = 1
  public hasHeating: boolean = false
  public hasCooling: boolean = false

  constructor() {}

  ngOnInit() {
    this.hasHeating = !!this.service.getCharacteristic('HeatingThresholdTemperature')
    this.hasCooling = !!this.service.getCharacteristic('CoolingThresholdTemperature')
  }

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
  }

  onLongClick() {
    const ref = this.$modal.open(HeaterCoolerManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
  }
}
