import type { CharacteristicType } from '@homebridge/hap-client'

import { DecimalPipe, NgClass, UpperCasePipe } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './thermostat.manage.component.html',
  styleUrls: ['./thermostat.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    FormsModule,
    NouisliderComponent,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
    UpperCasePipe,
  ],
})
export class ThermostatManageComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $settings = inject(SettingsService)

  @Input() public service: ServiceTypeX

  public targetMode: number
  public targetTemperature: any
  public targetTemperatureChanged: Subject<string> = new Subject<string>()
  public targetThresholdChanged: Subject<string> = new Subject<string>()
  public targetStateValidValues: number[] = []
  public CoolingThresholdTemperature: CharacteristicType
  public HeatingThresholdTemperature: CharacteristicType
  public targetCoolingTemp: number
  public targetHeatingTemp: number
  public autoTemp: [number, number]
  public hasHumidity: boolean = false
  public temperatureUnits = this.$settings.env.temperatureUnits

  constructor() {
    this.targetTemperatureChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        this.service.getCharacteristic('TargetTemperature').setValue(this.targetTemperature.value)
      })

    this.targetThresholdChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        if (this.HeatingThresholdTemperature) {
          this.service.getCharacteristic('HeatingThresholdTemperature').setValue(this.targetHeatingTemp)
        }
        if (this.CoolingThresholdTemperature) {
          this.service.getCharacteristic('CoolingThresholdTemperature').setValue(this.targetCoolingTemp)
        }
      })
  }

  public ngOnInit() {
    this.targetMode = this.service.values.TargetHeatingCoolingState
    this.CoolingThresholdTemperature = this.service.getCharacteristic('CoolingThresholdTemperature')
    this.HeatingThresholdTemperature = this.service.getCharacteristic('HeatingThresholdTemperature')
    this.targetStateValidValues = this.service.getCharacteristic('TargetHeatingCoolingState').validValues as number[]
    this.loadTargetTemperature()
    if (this.service.getCharacteristic('CurrentRelativeHumidity')) {
      this.hasHumidity = true
    }
    setTimeout(() => {
      const sliderElements = document.querySelectorAll('.noUi-target')
      sliderElements.forEach((sliderElement: HTMLElement) => {
        sliderElement.style.background = 'linear-gradient(to right, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))'
      })
    }, 10)
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    this.service.getCharacteristic('TargetHeatingCoolingState').setValue(this.targetMode)

    const target = event.target as HTMLButtonElement
    target.blur()
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

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private loadTargetTemperature() {
    const TargetTemperature = this.service.getCharacteristic('TargetTemperature')
    this.targetTemperature = {
      value: TargetTemperature.value,
      min: TargetTemperature.minValue,
      max: TargetTemperature.maxValue,
      step: TargetTemperature.minStep || 0.5,
    }
    this.targetCoolingTemp = this.service.getCharacteristic('CoolingThresholdTemperature')?.value as number
    this.targetHeatingTemp = this.service.getCharacteristic('HeatingThresholdTemperature')?.value as number
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]
  }
}
