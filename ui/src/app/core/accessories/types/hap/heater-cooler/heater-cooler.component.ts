import { DecimalPipe, UpperCasePipe } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { HeaterCoolerManageComponent } from '@/app/core/accessories/types/hap/heater-cooler/heater-cooler.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-heater-cooler',
  templateUrl: './heater-cooler.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
    UpperCasePipe,
  ],
})
export class HeaterCoolerComponent implements OnInit {
  private $modal = inject(NgbModal)
  private injector = inject(EnvironmentInjector)
  private $settings = inject(SettingsService)
  private $accessories = inject(AccessoriesService)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)
  public readonly type = input<'heater' | 'cooler'>()

  public temperatureUnits = this.$settings.env.temperatureUnits
  public readonly hasHeating = signal(false)
  public readonly hasCooling = signal(false)

  public ngOnInit() {
    this.hasHeating.set('HeatingThresholdTemperature' in this.service().values)
    this.hasCooling.set('CoolingThresholdTemperature' in this.service().values)
  }

  public getStatusFill(): string {
    const values = this.service().values
    const isActive = values?.Active || values?.On
    const isCooling = (values?.CurrentHeaterCoolerState === 3 && values?.Active === 1)
      || (this.type() === 'cooler' && isActive)
    const isHeating = (values?.CurrentHeaterCoolerState === 2 && values?.Active === 1)
      || (this.type() === 'heater' && isActive)

    if (isCooling) {
      return 'url(#coolingGradient)'
    }

    if (isHeating) {
      return 'url(#heatingGradient)'
    }

    return isActive ? '#42d672' : '#7b7b7b'
  }

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('Active' in this.service().values) {
      void this.service().getCharacteristic('Active').setValue(this.service().values.Active ? 0 : 1)
    } else if ('On' in this.service().values) {
      void this.service().getCharacteristic('On').setValue(!this.service().values.On)
    }
  }

  public onLongClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('TargetHeaterCoolerState' in this.service().values) {
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

      this.$modal.open(HeaterCoolerManageComponent, {
        size: 'md',
        backdrop: 'static',
        injector: modalInjector,
      })
    }
  }
}
