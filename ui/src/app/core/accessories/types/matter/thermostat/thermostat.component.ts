import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, createEnvironmentInjector, EnvironmentInjector, inject, input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { getThermostatLocalTemperature, getThermostatSystemMode, isThermostatOn } from '@/app/core/accessories/types/matter/matter-device.utils'
import { MatterThermostatManageComponent } from '@/app/core/accessories/types/matter/thermostat/thermostat.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-matter-thermostat',
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
export class MatterThermostatComponent {
  private $modal = inject(NgbModal)
  private injector = inject(EnvironmentInjector)
  private $settings = inject(SettingsService)
  private $accessories = inject(AccessoriesService)

  public service = input.required<ServiceTypeX>()
  public readyForControl = input<boolean>(false)

  public temperatureUnits = this.$settings.env.temperatureUnits

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

    this.$modal.open(MatterThermostatManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }

  public getStatusFill(): string {
    const mode = this.systemMode()
    if (mode === 3) {
      return 'url(#coolingGradient)'
    }

    if (mode === 4) {
      return 'url(#heatingGradient)'
    }

    if (mode === 1) {
      return '#42d672'
    }

    return '#7b7b7b'
  }

  public isOn = computed(() => isThermostatOn(this.service()))

  public systemMode = computed(() => getThermostatSystemMode(this.service()))

  public currentTemperature = computed(() => getThermostatLocalTemperature(this.service()))
}
