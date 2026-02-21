import type { CharacteristicType } from '@homebridge/hap-client'

import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject, Subscription } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'

@Component({
  templateUrl: './humidifier-dehumidifier.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
})
export class HumidifierDehumidifierManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  @Input() public type: 'humidifier' | 'dehumidifier'
  @Input() public $accessories: AccessoriesService

  private stateSubscription: Subscription

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

  constructor() {
    this.targetHumidityChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        if (this.RelativeHumidityHumidifierThreshold) {
          this.service.getCharacteristic('RelativeHumidityHumidifierThreshold').setValue(this.targetHumidifierHumidity)
        }
        if (this.RelativeHumidityDehumidifierThreshold) {
          this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold').setValue(this.targetDehumidifierHumidity)
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
    this.targetMode = this.service.values.TargetHumidifierDehumidifierState
    this.RelativeHumidityDehumidifierThreshold = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')
    this.RelativeHumidityHumidifierThreshold = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')
    this.targetStateValidValues = this.service.getCharacteristic('TargetHumidifierDehumidifierState').validValues as number[]
    this.loadTargetHumidity()

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
        this.targetMode = this.service.values.TargetHumidifierDehumidifierState
        this.targetDehumidifierHumidity = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')?.value as number
        this.targetHumidifierHumidity = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')?.value as number
        this.autoHumidity = [this.targetHumidifierHumidity, this.targetDehumidifierHumidity]

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

  private loadTargetHumidity() {
    this.targetDehumidifierHumidity = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')?.value as number
    this.targetHumidifierHumidity = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')?.value as number
    this.autoHumidity = [this.targetHumidifierHumidity, this.targetDehumidifierHumidity]
  }

  public setTargetState(value: number, event: MouseEvent) {
    this.targetState = value
    this.service.getCharacteristic('Active').setValue(this.targetState)
    this.loadTargetHumidity()
    this.applySliderGradient()

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    this.service.getCharacteristic('TargetHumidifierDehumidifierState').setValue(this.targetMode)
    this.loadTargetHumidity()

    const target = event.target as HTMLButtonElement
    target.blur()

    // Apply gradient to the new slider after it's created
    this.applySliderGradient()
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

  private applySliderGradient() {
    setTimeout(() => {
      const humiditySliders = document.querySelectorAll('.humidity-slider .noUi-target')
      humiditySliders.forEach((sliderElement: HTMLElement) => {
        sliderElement.style.background = 'linear-gradient(to left, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))'
      })

      const fanSliders = document.querySelectorAll('.fan-slider .noUi-target')
      fanSliders.forEach((sliderElement: HTMLElement) => {
        sliderElement.style.background = this.getFanSliderGradient()
      })
    }, 10)
  }
}
