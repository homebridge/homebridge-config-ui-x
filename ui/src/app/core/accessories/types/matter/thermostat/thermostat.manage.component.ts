import { DecimalPipe, NgClass, UpperCasePipe } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject, Subscription } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import {
  getThermostatCoolingSetpoint,
  getThermostatHeatingSetpoint,
  getThermostatLocalTemperature,
  getThermostatSystemMode,
  setThermostatCoolingSetpoint,
  setThermostatHeatingSetpoint,
  setThermostatSystemMode,
} from '@/app/core/accessories/types/matter/matter-device.utils'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './thermostat.manage.component.html',
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
export class MatterThermostatManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)
  private $settings = inject(SettingsService)

  @Input() public service: ServiceTypeX
  @Input() public $accessories: AccessoriesService

  public targetMode: number
  public targetHeatingTemp: number
  public targetCoolingTemp: number
  public autoTemp: [number, number]
  public temperatureUnits = this.$settings.env.temperatureUnits
  private stateSubscription: Subscription

  public heatingTempChanged: Subject<number> = new Subject<number>()
  public coolingTempChanged: Subject<number> = new Subject<number>()
  public autoTempChanged: Subject<[number, number]> = new Subject<[number, number]>()

  // Temperature range limits (in Celsius, will be converted if needed)
  public minHeatSetpoint: number = 7
  public maxHeatSetpoint: number = 30
  public minCoolSetpoint: number = 10
  public maxCoolSetpoint: number = 35

  constructor() {
    this.heatingTempChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        setThermostatHeatingSetpoint(this.service, this.targetHeatingTemp)
      })

    this.coolingTempChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        setThermostatCoolingSetpoint(this.service, this.targetCoolingTemp)
      })

    this.autoTempChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        setThermostatHeatingSetpoint(this.service, this.autoTemp[0])
        setThermostatCoolingSetpoint(this.service, this.autoTemp[1])
      })
  }

  public ngOnInit() {
    this.targetMode = getThermostatSystemMode(this.service)
    this.targetHeatingTemp = getThermostatHeatingSetpoint(this.service)
    this.targetCoolingTemp = getThermostatCoolingSetpoint(this.service)
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]

    // Get limits from cluster if available
    const cluster = this.service.clusters?.thermostat
    if (cluster) {
      this.minHeatSetpoint = cluster.minHeatSetpointLimit ? cluster.minHeatSetpointLimit / 100 : 7
      this.maxHeatSetpoint = cluster.maxHeatSetpointLimit ? cluster.maxHeatSetpointLimit / 100 : 30
      this.minCoolSetpoint = cluster.minCoolSetpointLimit ? cluster.minCoolSetpointLimit / 100 : 10
      this.maxCoolSetpoint = cluster.maxCoolSetpointLimit ? cluster.maxCoolSetpointLimit / 100 : 35
    }

    this.applySliderGradient()

    // Subscribe to state changes to update modal in real-time
    this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
      this.targetMode = getThermostatSystemMode(this.service)
      this.targetHeatingTemp = getThermostatHeatingSetpoint(this.service)
      this.targetCoolingTemp = getThermostatCoolingSetpoint(this.service)
      this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]

      // Apply gradient when mode changes externally
      this.applySliderGradient()
    })
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    setThermostatSystemMode(this.service, this.targetMode)

    const target = event.target as HTMLButtonElement
    target.blur()

    // Apply gradient to the new slider after it's created
    this.applySliderGradient()
  }

  public onHeatingTempChange() {
    this.heatingTempChanged.next(this.targetHeatingTemp)
  }

  public onCoolingTempChange() {
    this.coolingTempChanged.next(this.targetCoolingTemp)
  }

  public onAutoTempChange() {
    this.targetHeatingTemp = this.autoTemp[0]
    this.targetCoolingTemp = this.autoTemp[1]
    this.autoTempChanged.next(this.autoTemp)
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public ngOnDestroy() {
    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe()
    }
  }

  public get currentTemperature(): number | null {
    return getThermostatLocalTemperature(this.service)
  }

  private applySliderGradient() {
    setTimeout(() => {
      const sliderElements = document.querySelectorAll('.noUi-target')
      sliderElements.forEach((sliderElement: HTMLElement) => {
        sliderElement.style.background = 'linear-gradient(to right, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))'
      })
    }, 10)
  }
}
