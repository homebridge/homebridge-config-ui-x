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
import { getFanPercentSetting, isFanOn, setFanSpeed } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  templateUrl: './fan.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
  ],
})
export class MatterFanManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  @Input() public $accessories: AccessoriesService

  private stateSubscription: Subscription

  public targetMode: boolean
  public targetSpeed: {
    value: number
    min: number
    max: number
    step: number
  }

  public targetSpeedChanged: Subject<number> = new Subject<number>()

  constructor() {
    this.targetSpeedChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        setFanSpeed(this.service, this.targetSpeed.value)
      })
  }

  public ngOnInit() {
    this.targetMode = isFanOn(this.service)
    this.loadSpeed()

    // Subscribe to real-time accessory updates
    if (this.$accessories) {
      this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
        this.targetMode = isFanOn(this.service)
        if (this.targetSpeed) {
          this.targetSpeed.value = getFanPercentSetting(this.service)
        }
      })
    }
  }

  public ngOnDestroy() {
    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe()
    }
  }

  public setTargetMode(value: boolean, event: MouseEvent) {
    this.targetMode = value

    if (value) {
      // Turn on - set to 100% if currently 0%
      const speed = this.targetSpeed.value || 100
      setFanSpeed(this.service, speed)
      this.targetSpeed.value = speed
    } else {
      // Turn off
      setFanSpeed(this.service, 0)
      this.targetSpeed.value = 0
    }

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public onTargetSpeedChange() {
    this.targetSpeedChanged.next(this.targetSpeed.value)

    // Update targetMode based on speed
    this.targetMode = this.targetSpeed.value > 0
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private loadSpeed() {
    this.targetSpeed = {
      value: getFanPercentSetting(this.service),
      min: 0,
      max: 100,
      step: 1,
    }

    setTimeout(() => {
      const sliderElements = document.querySelectorAll('.noUi-target')
      sliderElements.forEach((sliderElement: HTMLElement) => {
        sliderElement.style.background = 'linear-gradient(to right, #add8e6, #416bdf)'
      })
    }, 10)
  }
}
