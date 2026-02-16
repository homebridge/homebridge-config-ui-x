import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
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
export class MatterThermostatManageComponent implements OnInit {
  protected destroyRef = inject(DestroyRef)
  protected $activeModal = inject(NgbActiveModal)
  protected cdr = inject(ChangeDetectorRef)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)

  // Inject modal data using modern DI pattern
  private modalData = inject(ACCESSORY_MANAGE_MODAL_DATA)

  // Public properties for component use (accessed by templates)
  public service!: ServiceTypeX
  public $accessories!: AccessoriesService

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

  public ngOnInit() {
    // Null safety check
    if (!this.modalData.service || !this.modalData.$accessories) {
      console.error('MatterThermostatManageComponent: service or $accessories not provided')
      this.$activeModal.dismiss('Missing required data')
      return
    }

    // Store in public properties (same object references)
    this.service = this.modalData.service
    this.$accessories = this.modalData.$accessories

    this.setupComponent()
    this.subscribeToAccessoryUpdates()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private setupComponent() {
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

  private subscribeToAccessoryUpdates() {
    if (this.$accessories) {
      this.$accessories.accessoryData.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        // Update service reference to get latest data (zoneless Angular compatibility)
        const updatedService = this.$accessories.accessories.services.find(s => s.uniqueId === this.service.uniqueId)
        if (updatedService) {
          this.service = updatedService
        }
        this.handleAccessoryUpdate()
        this.cdr.markForCheck()
      })
    }
  }

  private createDebouncedSubscription<T>(
    subject$: Subject<T>,
    callback: (value: T) => void,
    debounceMs: number = 500,
  ) {
    subject$
      .pipe(debounceTime(debounceMs), takeUntilDestroyed(this.destroyRef))
      .subscribe(callback)
  }

  private applySliderGradient(gradient: string, selector: string = '.noUi-target') {
    requestAnimationFrame(() => {
      const sliderElements = document.querySelectorAll<HTMLElement>(selector)
      sliderElements.forEach((sliderElement) => {
        sliderElement.style.background = gradient
      })
    })
  }

  protected blurTarget(event: MouseEvent) {
    const target = event.target as HTMLButtonElement
    target.blur()
  }

  private handleAccessoryUpdate() {
    this.targetMode = getThermostatSystemMode(this.service)
    this.targetHeatingTemp = getThermostatHeatingSetpoint(this.service)
    this.targetCoolingTemp = getThermostatCoolingSetpoint(this.service)
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]

    // Apply gradient when mode changes externally
    this.applySliderGradient('linear-gradient(to right, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))')
  }

  public getStatusClass(): string {
    if (this.targetMode === 3) {
      return 'status-color-cooling'
    }

    if (this.targetMode === 4) {
      return 'status-color-heating'
    }

    if (this.targetMode === 1) {
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
