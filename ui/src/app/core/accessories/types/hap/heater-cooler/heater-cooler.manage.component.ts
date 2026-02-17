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
  selector: 'app-heater-cooler-manage',
  imports: [
    FormsModule,
    NouisliderComponent,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
    UpperCasePipe,
  ],
  standalone: true,
  templateUrl: './heater-cooler.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaterCoolerManageComponent extends BaseManageComponent {
  private $settings = inject(SettingsService)

  public type: 'heater' | 'cooler' | undefined

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
  public serviceFan: any
  public targetRotationSpeed: any
  public targetRotationSpeedChanged: Subject<string> = new Subject<string>()

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetTemperatureChanged, () => {
      if (this.HeatingThresholdTemperature) {
        void this.service.getCharacteristic('HeatingThresholdTemperature').setValue(this.targetHeatingTemp)
      }
      if (this.CoolingThresholdTemperature) {
        void this.service.getCharacteristic('CoolingThresholdTemperature').setValue(this.targetCoolingTemp)
      }
    })

    this.createDebouncedSubscription(this.targetRotationSpeedChanged, () => {
      if (this.serviceFan) {
        void this.serviceFan.getCharacteristic('RotationSpeed').setValue(this.targetRotationSpeed.value)
      }
    })

    this.targetState = this.service.values.Active
    this.targetMode = this.service.values.TargetHeaterCoolerState
    this.CoolingThresholdTemperature = this.service.getCharacteristic('CoolingThresholdTemperature')
    this.HeatingThresholdTemperature = this.service.getCharacteristic('HeatingThresholdTemperature')
    this.targetStateValidValues = this.service.getCharacteristic('TargetHeaterCoolerState').validValues as number[]

    // Derive type from valid target states: heat-only, cool-only, or dual
    if (this.targetStateValidValues.includes(1) && !this.targetStateValidValues.includes(2)) {
      this.type = 'heater'
    } else if (this.targetStateValidValues.includes(2) && !this.targetStateValidValues.includes(1)) {
      this.type = 'cooler'
    }

    this.loadTargetTemperature()

    // Check for a linked Fan/Fanv2 service (combined from same physical device)
    if (this.service.linkedServices) {
      this.serviceFan = Object.values(this.service.linkedServices).find((s: any) => s.type === 'Fan' || s.type === 'Fanv2')
    }

    if (this.serviceFan) {
      this.loadRotationSpeed()
    }

    this.applyAllGradients()
  }

  protected handleAccessoryUpdate() {
    this.targetState = this.service.values.Active
    this.targetMode = this.service.values.TargetHeaterCoolerState
    this.targetCoolingTemp = this.service.getCharacteristic('CoolingThresholdTemperature')?.value as number
    this.targetHeatingTemp = this.service.getCharacteristic('HeatingThresholdTemperature')?.value as number
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]

    if (this.targetRotationSpeed && this.serviceFan) {
      this.targetRotationSpeed.value = this.serviceFan.getCharacteristic('RotationSpeed')?.value
    }

    // Apply gradient when mode changes externally
    this.applyAllGradients()
  }

  public getStatusColor(): string {
    const values = this.service.values
    const isActive = values?.Active || values?.On
    const isCooling = (values?.CurrentHeaterCoolerState === 3 && values?.Active === 1)
      || (this.type === 'cooler' && isActive)
    const isHeating = (values?.CurrentHeaterCoolerState === 2 && values?.Active === 1)
      || (this.type === 'heater' && isActive)

    if (isCooling) {
      return '#1e8bbd'
    }

    if (isHeating) {
      return '#e69533'
    }

    return isActive ? '#42d672' : '#7b7b7b'
  }

  public setTargetState(value: number, event: MouseEvent) {
    this.targetState = value
    void this.service.getCharacteristic('Active').setValue(this.targetState)
    this.loadTargetTemperature()
    this.applyAllGradients()

    this.blurTarget(event)
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    void this.service.getCharacteristic('TargetHeaterCoolerState').setValue(this.targetMode)
    this.loadTargetTemperature()

    this.blurTarget(event)

    // Apply gradient to the new slider after it's created
    this.applyAllGradients()
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

  public onTargetRotationSpeedChange() {
    this.targetRotationSpeedChanged.next(this.targetRotationSpeed.value)
  }

  private loadRotationSpeed() {
    const RotationSpeed = this.serviceFan.getCharacteristic('RotationSpeed')
    if (RotationSpeed) {
      this.targetRotationSpeed = {
        value: RotationSpeed.value,
        min: RotationSpeed.minValue,
        max: RotationSpeed.maxValue,
        step: RotationSpeed.minStep,
        unit: RotationSpeed.unit,
      }
    }
  }

  private loadTargetTemperature() {
    this.targetCoolingTemp = this.service.getCharacteristic('CoolingThresholdTemperature')?.value as number
    this.targetHeatingTemp = this.service.getCharacteristic('HeatingThresholdTemperature')?.value as number
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]
  }

  private getFanSliderGradient(): string {
    if (!this.targetState) {
      // Off - grey
      return 'linear-gradient(to right, #c0c0c0, #7b7b7b)'
    }

    switch (this.targetMode) {
      case 2: // Cool
        return 'linear-gradient(to right, #add8e6, #416bdf)'
      case 1: // Heat
        return 'linear-gradient(to right, #ffb978, #e05a33)'
      case 0: // Auto
      default:
        return 'linear-gradient(to right, #90ee90, #2d8659)'
    }
  }

  private applyAllGradients() {
    this.applySliderGradient(
      'linear-gradient(to right, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))',
      '.temp-slider .noUi-target',
    )
    if (this.serviceFan) {
      this.applySliderGradient(this.getFanSliderGradient(), '.fan-slider .noUi-target')
    }
  }
}
