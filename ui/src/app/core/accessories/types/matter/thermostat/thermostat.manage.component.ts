import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { ThermostatSystemMode } from '@/app/core/accessories/types/matter/matter-device.constants'
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
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-thermostat-manage',
  imports: [
    FormsModule,
    NouisliderComponent,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
    UpperCasePipe,
  ],
  standalone: true,
  templateUrl: './thermostat.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterThermostatManageComponent extends BaseManageComponent {
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)

  public targetMode: number
  public targetHeatingTemp: number
  public targetCoolingTemp: number
  public autoTemp: [number, number]
  public temperatureUnits = this.$settings.env.temperatureUnits

  private heatingTempChanged: Subject<number> = new Subject<number>()
  private coolingTempChanged: Subject<number> = new Subject<number>()
  private autoTempChanged: Subject<[number, number]> = new Subject<[number, number]>()

  // Temperature range limits (in Celsius, will be converted if needed)
  public minHeatSetpoint: number = 7
  public maxHeatSetpoint: number = 30
  public minCoolSetpoint: number = 10
  public maxCoolSetpoint: number = 35

  protected setupComponent() {
    this.createDebouncedSubscription(this.heatingTempChanged, async () => {
      try {
        await setThermostatHeatingSetpoint(this.service, this.targetHeatingTemp)
      } catch (error) {
        this.$toastr.error('Failed to set heating temperature', 'Error')
        // Revert to current value on error
        this.targetHeatingTemp = getThermostatHeatingSetpoint(this.service)
        this.cdr.markForCheck()
      }
    })

    this.createDebouncedSubscription(this.coolingTempChanged, async () => {
      try {
        await setThermostatCoolingSetpoint(this.service, this.targetCoolingTemp)
      } catch (error) {
        this.$toastr.error('Failed to set cooling temperature', 'Error')
        // Revert to current value on error
        this.targetCoolingTemp = getThermostatCoolingSetpoint(this.service)
        this.cdr.markForCheck()
      }
    })

    this.createDebouncedSubscription(this.autoTempChanged, async () => {
      try {
        await setThermostatHeatingSetpoint(this.service, this.autoTemp[0])
        await setThermostatCoolingSetpoint(this.service, this.autoTemp[1])
      } catch (error) {
        this.$toastr.error('Failed to set temperature range', 'Error')
        // Revert to current values on error
        this.targetHeatingTemp = getThermostatHeatingSetpoint(this.service)
        this.targetCoolingTemp = getThermostatCoolingSetpoint(this.service)
        this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]
        this.cdr.markForCheck()
      }
    })

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

    this.applySliderGradient('linear-gradient(to right, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))')
  }

  protected handleAccessoryUpdate() {
    const previousMode = this.targetMode
    this.targetMode = getThermostatSystemMode(this.service)
    this.targetHeatingTemp = getThermostatHeatingSetpoint(this.service)
    this.targetCoolingTemp = getThermostatCoolingSetpoint(this.service)
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]

    // Only re-apply gradient when mode changes (new slider is created)
    if (previousMode !== this.targetMode) {
      this.applySliderGradient('linear-gradient(to right, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))')
    }
  }

  public getStatusClass(): string {
    if (this.targetMode === ThermostatSystemMode.Cool) {
      return 'status-color-cooling'
    }

    if (this.targetMode === ThermostatSystemMode.Heat) {
      return 'status-color-heating'
    }

    if (this.targetMode === ThermostatSystemMode.Auto) {
      return 'status-color-active'
    }

    return 'status-color-inactive'
  }

  public async setTargetMode(value: number, event: MouseEvent) {
    const previousMode = this.targetMode

    try {
      this.targetMode = value
      this.cdr.markForCheck()

      await setThermostatSystemMode(this.service, this.targetMode)

      this.blurTarget(event)

      // Apply gradient to the new slider after it's created
      this.applySliderGradient('linear-gradient(to right, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))')
    } catch (error) {
      this.$toastr.error('Failed to set thermostat mode', 'Error')
      // Revert to previous mode on error
      this.targetMode = previousMode
      this.cdr.markForCheck()
    }
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

  public get currentTemperature(): number | null {
    return getThermostatLocalTemperature(this.service)
  }
}
