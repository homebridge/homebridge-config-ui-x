import { DecimalPipe, NgClass, UpperCasePipe } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ThermostatManageComponent } from '@/app/core/accessories/types/hap/thermostat/thermostat.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  selector: 'app-thermostat',
  templateUrl: './thermostat.component.html',
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
export class ThermostatComponent {
  private $modal = inject(NgbModal)
  private $settings = inject(SettingsService)
  private $accessories = inject(AccessoriesService)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public temperatureUnits = this.$settings.env.temperatureUnits

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    const ref = this.$modal.open(ThermostatManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
    ref.componentInstance.$accessories = this.$accessories
  }
}
