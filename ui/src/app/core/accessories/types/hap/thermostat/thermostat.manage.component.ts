import type { SliderControlConfig } from '@/app/core/accessories/accessories.interfaces'
import type { CharacteristicType } from '@homebridge/hap-client'

import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  templateUrl: './thermostat.manage.component.html',
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
export class ThermostatManageComponent extends BaseManageComponent {
  private $settings = inject(SettingsService)

  public targetMode: number
  public targetTemperature: SliderControlConfig
  public targetTemperatureChanged: Subject<number> = new Subject<number>()
  public targetThresholdChanged: Subject<undefined> = new Subject<undefined>()
  public targetStateValidValues: number[] = []
  public CoolingThresholdTemperature: CharacteristicType
  public HeatingThresholdTemperature: CharacteristicType
  public targetCoolingTemp: number
  public targetHeatingTemp: number
  public autoTemp: [number, number]
  public hasHumidity: boolean = false
  public temperatureUnits = this.$settings.env.temperatureUnits

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetTemperatureChanged, () => {
      void this.service.getCharacteristic('TargetTemperature').setValue(this.targetTemperature.value)
    })

    this.createDebouncedSubscription(this.targetThresholdChanged, () => {
      if (this.HeatingThresholdTemperature) {
        void this.service.getCharacteristic('HeatingThresholdTemperature').setValue(this.targetHeatingTemp)
      }
      if (this.CoolingThresholdTemperature) {
        void this.service.getCharacteristic('CoolingThresholdTemperature').setValue(this.targetCoolingTemp)
      }
    })

    this.targetMode = this.service.values.TargetHeatingCoolingState
    this.CoolingThresholdTemperature = this.service.getCharacteristic('CoolingThresholdTemperature')
    this.HeatingThresholdTemperature = this.service.getCharacteristic('HeatingThresholdTemperature')
    this.targetStateValidValues = this.service.getCharacteristic('TargetHeatingCoolingState').validValues as number[]
    this.loadTargetTemperature()
    if (this.service.getCharacteristic('CurrentRelativeHumidity')) {
      this.hasHumidity = true
    }
    this.applyThermostatGradient()
  }

  protected handleAccessoryUpdate() {
    this.targetMode = this.service.values.TargetHeatingCoolingState
    if (this.targetTemperature) {
      this.targetTemperature.value = this.service.getCharacteristic('TargetTemperature').value as number
    }
    if (this.CoolingThresholdTemperature) {
      this.targetCoolingTemp = this.service.getCharacteristic('CoolingThresholdTemperature').value as number
    }
    if (this.HeatingThresholdTemperature) {
      this.targetHeatingTemp = this.service.getCharacteristic('HeatingThresholdTemperature').value as number
    }
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]

    // Apply gradient when mode changes externally
    this.applyThermostatGradient()
  }

  public getStatusColor(): string {
    const state = this.service.values?.CurrentHeatingCoolingState
    const target = this.service.values?.TargetHeatingCoolingState
    if (state === 2) {
      return '#1e8bbd'
    }

    if (state === 1) {
      return '#e69533'
    }

    if (target === 3) {
      return '#42d672'
    }

    return '#7b7b7b'
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    void this.service.getCharacteristic('TargetHeatingCoolingState').setValue(this.targetMode)

    this.blurTarget(event)

    // Apply gradient to the new slider after it's created
    this.applyThermostatGradient()
  }

  public onTemperatureStateChange() {
    this.targetTemperatureChanged.next(this.targetTemperature.value)
  }

  public onThresholdStateChange() {
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]
    this.targetThresholdChanged.next(undefined)
  }

  public onAutoThresholdStateChange() {
    this.targetHeatingTemp = this.autoTemp[0]
    this.targetCoolingTemp = this.autoTemp[1]
    this.targetThresholdChanged.next(undefined)
  }

  private loadTargetTemperature() {
    const TargetTemperature = this.service.getCharacteristic('TargetTemperature')
    this.targetTemperature = {
      value: TargetTemperature.value as number,
      min: TargetTemperature.minValue,
      max: TargetTemperature.maxValue,
      step: TargetTemperature.minStep || 0.5,
    }
    this.targetCoolingTemp = this.service.getCharacteristic('CoolingThresholdTemperature')?.value as number
    this.targetHeatingTemp = this.service.getCharacteristic('HeatingThresholdTemperature')?.value as number
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]
  }

  private applyThermostatGradient() {
    this.applySliderGradient('linear-gradient(to right, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))')
  }
}
