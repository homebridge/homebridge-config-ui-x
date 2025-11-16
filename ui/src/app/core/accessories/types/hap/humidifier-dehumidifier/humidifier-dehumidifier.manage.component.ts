import type { CharacteristicType } from '@homebridge/hap-client'

import { NgClass } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject, Subscription } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'

@Component({
  templateUrl: './humidifier-dehumidifier.manage.component.html',
  standalone: true,
  imports: [
    NgClass,
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
  }

  public ngOnInit() {
    this.targetState = this.service.values.Active
    this.targetMode = this.service.values.TargetHumidifierDehumidifierState
    this.RelativeHumidityDehumidifierThreshold = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')
    this.RelativeHumidityHumidifierThreshold = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')
    this.targetStateValidValues = this.service.getCharacteristic('TargetHumidifierDehumidifierState').validValues as number[]
    this.loadTargetHumidity()
    this.applySliderGradient()

    // Subscribe to real-time accessory updates
    if (this.$accessories) {
      this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
        this.targetState = this.service.values.Active
        this.targetMode = this.service.values.TargetHumidifierDehumidifierState
        this.targetDehumidifierHumidity = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')?.value as number
        this.targetHumidifierHumidity = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')?.value as number
        this.autoHumidity = [this.targetHumidifierHumidity, this.targetDehumidifierHumidity]

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

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private applySliderGradient() {
    setTimeout(() => {
      const sliderElements = document.querySelectorAll('.noUi-target')
      sliderElements.forEach((sliderElement: HTMLElement) => {
        sliderElement.style.background = 'linear-gradient(to left, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))'
      })
    }, 10)
  }
}
