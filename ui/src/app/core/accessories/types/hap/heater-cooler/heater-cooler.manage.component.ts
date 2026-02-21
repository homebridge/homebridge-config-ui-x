import type { CharacteristicType } from '@homebridge/hap-client'

import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject, Subscription } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/settings.service'

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
})
export class HeaterCoolerManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)
  private $settings = inject(SettingsService)

  @Input() public service: ServiceTypeX
  @Input() public type: 'heater' | 'cooler'
  @Input() public $accessories: AccessoriesService

  private stateSubscription: Subscription

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

  constructor() {
    this.targetTemperatureChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        if (this.HeatingThresholdTemperature) {
          this.service.getCharacteristic('HeatingThresholdTemperature').setValue(this.targetHeatingTemp)
        }
        if (this.CoolingThresholdTemperature) {
          this.service.getCharacteristic('CoolingThresholdTemperature').setValue(this.targetCoolingTemp)
        }
      })

    this.targetRotationSpeedChanged
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        if (this.serviceFan) {
          this.serviceFan.getCharacteristic('RotationSpeed').setValue(this.targetRotationSpeed.value)
        }
      })
  }

  public ngOnInit() {
    this.targetState = this.service.values.Active
    this.targetMode = this.service.values.TargetHeaterCoolerState
    this.CoolingThresholdTemperature = this.service.getCharacteristic('CoolingThresholdTemperature')
    this.HeatingThresholdTemperature = this.service.getCharacteristic('HeatingThresholdTemperature')
    this.targetStateValidValues = this.service.getCharacteristic('TargetHeaterCoolerState').validValues as number[]
    this.loadTargetTemperature()

    // Check for a linked Fan/Fanv2 service (combined from same physical device)
    if (this.service.linkedServices) {
      this.serviceFan = Object.values(this.service.linkedServices).find((s: any) => s.type === 'Fan' || s.type === 'Fanv2')
    }

    if (this.serviceFan) {
      this.loadRotationSpeed()
    }

    this.applySliderGradient()

    // Subscribe to real-time accessory updates
    if (this.$accessories) {
      this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
        this.targetState = this.service.values.Active
        this.targetMode = this.service.values.TargetHeaterCoolerState
        this.targetCoolingTemp = this.service.getCharacteristic('CoolingThresholdTemperature')?.value as number
        this.targetHeatingTemp = this.service.getCharacteristic('HeatingThresholdTemperature')?.value as number
        this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]

        if (this.targetRotationSpeed && this.serviceFan) {
          this.targetRotationSpeed.value = this.serviceFan.getCharacteristic('RotationSpeed')?.value
        }

        // Apply gradient when mode changes externally
        this.applySliderGradient()
      })
    }
  }

  public ngOnDestroy() {
    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe()
    }
  }

  public setTargetState(value: number, event: MouseEvent) {
    this.targetState = value
    this.service.getCharacteristic('Active').setValue(this.targetState)
    this.loadTargetTemperature()
    this.applySliderGradient()

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    this.service.getCharacteristic('TargetHeaterCoolerState').setValue(this.targetMode)
    this.loadTargetTemperature()

    const target = event.target as HTMLButtonElement
    target.blur()

    // Apply gradient to the new slider after it's created
    this.applySliderGradient()
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

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
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

  private applySliderGradient() {
    setTimeout(() => {
      const tempSliders = document.querySelectorAll('.temp-slider .noUi-target')
      tempSliders.forEach((sliderElement: HTMLElement) => {
        sliderElement.style.background = 'linear-gradient(to right, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))'
      })

      const fanSliders = document.querySelectorAll('.fan-slider .noUi-target')
      fanSliders.forEach((sliderElement: HTMLElement) => {
        sliderElement.style.background = this.getFanSliderGradient()
      })
    }, 10)
  }
}
