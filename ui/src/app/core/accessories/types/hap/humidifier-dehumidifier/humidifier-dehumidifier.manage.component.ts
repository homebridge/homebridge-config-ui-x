import type { CharacteristicType } from '@homebridge/hap-client'

import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

@Component({
  selector: 'app-humidifier-dehumidifier-manage',
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './humidifier-dehumidifier.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HumidifierDehumidifierManageComponent extends BaseManageComponent {
  public type: 'humidifier' | 'dehumidifier' | undefined

  public targetState: number
  public targetMode: number
  public targetHumidityChanged: Subject<any> = new Subject<any>()
  public targetStateValidValues: number[] = []
  public RelativeHumidityDehumidifierThreshold: CharacteristicType
  public RelativeHumidityHumidifierThreshold: CharacteristicType
  public targetDehumidifierHumidity: number
  public targetHumidifierHumidity: number
  public autoHumidity: [number, number]
  public serviceFan: any
  public targetRotationSpeed: any
  public targetRotationSpeedChanged: Subject<string> = new Subject<string>()

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetHumidityChanged, () => {
      if (this.RelativeHumidityHumidifierThreshold) {
        void this.service.getCharacteristic('RelativeHumidityHumidifierThreshold').setValue(this.targetHumidifierHumidity)
      }
      if (this.RelativeHumidityDehumidifierThreshold) {
        void this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold').setValue(this.targetDehumidifierHumidity)
      }
    })

    this.createDebouncedSubscription(this.targetRotationSpeedChanged, () => {
      if (this.serviceFan) {
        void this.serviceFan.getCharacteristic('RotationSpeed').setValue(this.targetRotationSpeed.value)
      }
    })

    this.targetState = this.service.values.Active
    this.targetMode = this.service.values.TargetHumidifierDehumidifierState
    this.RelativeHumidityDehumidifierThreshold = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')
    this.RelativeHumidityHumidifierThreshold = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')
    this.targetStateValidValues = this.service.getCharacteristic('TargetHumidifierDehumidifierState').validValues as number[]

    // Derive type from valid target states: humidify-only, dehumidify-only, or dual
    if (this.targetStateValidValues.includes(1) && !this.targetStateValidValues.includes(2)) {
      this.type = 'humidifier'
    } else if (this.targetStateValidValues.includes(2) && !this.targetStateValidValues.includes(1)) {
      this.type = 'dehumidifier'
    }

    this.loadTargetHumidity()

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
    this.targetMode = this.service.values.TargetHumidifierDehumidifierState
    this.targetDehumidifierHumidity = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')?.value as number
    this.targetHumidifierHumidity = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')?.value as number
    this.autoHumidity = [this.targetHumidifierHumidity, this.targetDehumidifierHumidity]

    if (this.targetRotationSpeed && this.serviceFan) {
      this.targetRotationSpeed.value = this.serviceFan.getCharacteristic('RotationSpeed')?.value
    }

    // Apply gradient when mode changes externally
    this.applyAllGradients()
  }

  public getStatusClass(): string {
    const values = this.service.values
    const isActive = values?.Active || values?.On
    const isHumidifying = (values?.CurrentHumidifierDehumidifierState === 2 && values?.Active === 1)
      || (this.type === 'humidifier' && isActive)
    const isDehumidifying = (values?.CurrentHumidifierDehumidifierState === 3 && values?.Active === 1)
      || (this.type === 'dehumidifier' && isActive)

    if (isHumidifying) {
      return 'status-color-cooling'
    }

    if (isDehumidifying) {
      return 'status-color-heating'
    }

    return isActive ? 'status-color-active' : 'status-color-inactive'
  }

  private loadTargetHumidity() {
    this.targetDehumidifierHumidity = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')?.value as number
    this.targetHumidifierHumidity = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')?.value as number
    this.autoHumidity = [this.targetHumidifierHumidity, this.targetDehumidifierHumidity]
  }

  public setTargetState(value: number, event: MouseEvent) {
    this.targetState = value
    void this.service.getCharacteristic('Active').setValue(this.targetState)
    this.loadTargetHumidity()
    this.applyAllGradients()

    this.blurTarget(event)
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    void this.service.getCharacteristic('TargetHumidifierDehumidifierState').setValue(this.targetMode)
    this.loadTargetHumidity()

    this.blurTarget(event)

    // Apply gradient to the new slider after it's created
    this.applyAllGradients()
  }

  public onHumidityStateChange() {
    this.autoHumidity = [this.targetHumidifierHumidity, this.targetDehumidifierHumidity]
    this.targetHumidityChanged.next(undefined)
  }

  public onAutoHumidityStateChange() {
    this.targetHumidifierHumidity = this.autoHumidity[0]
    this.targetDehumidifierHumidity = this.autoHumidity[1]
    this.targetHumidityChanged.next(undefined)
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

  private getFanSliderGradient(): string {
    if (!this.targetState) {
      // Off - grey
      return 'linear-gradient(to right, #c0c0c0, #7b7b7b)'
    }

    switch (this.targetMode) {
      case 1: // Humidify
        return 'linear-gradient(to right, #add8e6, #416bdf)'
      case 2: // Dehumidify
        return 'linear-gradient(to right, #ffb978, #e05a33)'
      case 0: // Auto
      default:
        return 'linear-gradient(to right, #90ee90, #2d8659)'
    }
  }

  private applyAllGradients() {
    this.applySliderGradient(
      'linear-gradient(to left, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))',
      '.humidity-slider .noUi-target',
    )
    if (this.serviceFan) {
      this.applySliderGradient(this.getFanSliderGradient(), '.fan-slider .noUi-target')
    }
  }
}
