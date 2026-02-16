import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { Component, createEnvironmentInjector, EnvironmentInjector, inject, input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { ThermostatManageComponent } from '@/app/core/accessories/types/hap/thermostat/thermostat.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-thermostat',
  templateUrl: './thermostat.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
    UpperCasePipe,
  ],
})
export class ThermostatComponent {
  private $modal = inject(NgbModal)
  private injector = inject(EnvironmentInjector)
  private $settings = inject(SettingsService)
  private $accessories = inject(AccessoriesService)

  public service = input.required<ServiceTypeX>()
  public readyForControl = input<boolean>(false)

  public temperatureUnits = this.$settings.env.temperatureUnits

  public getStatusFill(): string {
    const state = this.service().values?.CurrentHeatingCoolingState
    const target = this.service().values?.TargetHeatingCoolingState
    if (state === 2) {
      return 'url(#coolingGradient)'
    }

    if (state === 1) {
      return 'url(#heatingGradient)'
    }

    if (target === 3) {
      return '#42d672'
    }

    return '#7b7b7b'
  }

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    const modalInjector = createEnvironmentInjector(
      [{
        provide: ACCESSORY_MANAGE_MODAL_DATA,
        useValue: {
          service: this.service(),
          $accessories: this.$accessories,
        },
      }],
      this.injector,
    )

    this.$modal.open(ThermostatManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }
}
