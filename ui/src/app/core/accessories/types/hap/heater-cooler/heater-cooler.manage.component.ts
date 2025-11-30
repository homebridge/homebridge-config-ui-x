import type { CharacteristicType } from '@homebridge/hap-client'

import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  templateUrl: './heater-cooler.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
    UpperCasePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaterCoolerManageComponent extends BaseManageComponent {
  private $settings = inject(SettingsService)

  public type = input.required<'heater' | 'cooler'>()

  public temperatureUnits = this.$settings.env.temperatureUnits
  public targetState: number
  public targetMode: number
  public targetTemperatureChanged: Subject<any> = new Subject<any>()
  public targetStateValidValues: number[] = []
  public CoolingThresholdTemperature: CharacteristicType
  public HeatingThresholdTemperature: CharacteristicType
  public targetCoolingTemp: number
  public targetHeatingTemp: number
  public autoTemp: [number, number]

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetTemperatureChanged, () => {
      if (this.HeatingThresholdTemperature) {
        void this.service.getCharacteristic('HeatingThresholdTemperature').setValue(this.targetHeatingTemp)
      }
      if (this.CoolingThresholdTemperature) {
        void this.service.getCharacteristic('CoolingThresholdTemperature').setValue(this.targetCoolingTemp)
      }
    })

    this.targetState = this.service.values.Active
    this.targetMode = this.service.values.TargetHeaterCoolerState
    this.CoolingThresholdTemperature = this.service.getCharacteristic('CoolingThresholdTemperature')
    this.HeatingThresholdTemperature = this.service.getCharacteristic('HeatingThresholdTemperature')
    this.targetStateValidValues = this.service.getCharacteristic('TargetHeaterCoolerState').validValues as number[]
    this.loadTargetTemperature()
    this.applySliderGradient('linear-gradient(to right, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))')
  }

  protected handleAccessoryUpdate() {
    this.targetState = this.service.values.Active
    this.targetMode = this.service.values.TargetHeaterCoolerState
    this.targetCoolingTemp = this.service.getCharacteristic('CoolingThresholdTemperature')?.value as number
    this.targetHeatingTemp = this.service.getCharacteristic('HeatingThresholdTemperature')?.value as number
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]

    // Apply gradient when mode changes externally
    this.applySliderGradient('linear-gradient(to right, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))')
  }

  public setTargetState(value: number, event: MouseEvent) {
    this.targetState = value
    void this.service.getCharacteristic('Active').setValue(this.targetState)
    this.loadTargetTemperature()

    this.blurTarget(event)
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    void this.service.getCharacteristic('TargetHeaterCoolerState').setValue(this.targetMode)
    this.loadTargetTemperature()

    this.blurTarget(event)

    // Apply gradient to the new slider after it's created
    this.applySliderGradient('linear-gradient(to right, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))')
  }

  public onTemperatureStateChange() {
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]
    this.targetTemperatureChanged.next(undefined)
  }

  public onAutoTemperatureStateChange() {
    this.targetHeatingTemp = this.autoTemp[0]
    this.targetCoolingTemp = this.autoTemp[1]
    this.targetTemperatureChanged.next(undefined)
  }

  private loadTargetTemperature() {
    this.targetCoolingTemp = this.service.getCharacteristic('CoolingThresholdTemperature')?.value as number
    this.targetHeatingTemp = this.service.getCharacteristic('HeatingThresholdTemperature')?.value as number
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]
  }
}
