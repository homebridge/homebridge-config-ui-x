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
  templateUrl: './window-covering.manage.component.html',
  standalone: true,
  imports: [
    NouisliderComponent,
    FormsModule,
    TranslatePipe,
  ],
})
export class WindowCoveringManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  @Input() public $accessories: AccessoriesService

  public targetMode: string
  public targetPositionChanged: Subject<string> = new Subject<string>()
  public targetPosition: {
    value: any
    min: number
    max: number
    step: number
  }

  private stateSubscription: Subscription

  constructor() {
    this.targetPositionChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        if (this.service.getCharacteristic('CurrentPosition').value < this.targetPosition.value) {
          this.service.values.PositionState = 1
        } else if (this.service.getCharacteristic('CurrentPosition').value > this.targetPosition.value) {
          this.service.values.PositionState = 0
        }
        this.service.getCharacteristic('TargetPosition').setValue(this.targetPosition.value)
      })
  }

  public ngOnInit() {
    this.targetMode = this.service.values.On
    this.loadTargetPosition()

    // Subscribe to state changes to update modal in real-time
    this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
      this.targetMode = this.service.values.On
      if (this.targetPosition && 'TargetPosition' in this.service.values) {
        this.targetPosition.value = this.service.getCharacteristic('TargetPosition').value
      }
    })
  }

  public onTargetPositionChange() {
    this.targetPositionChanged.next(this.targetPosition.value)
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public ngOnDestroy() {
    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe()
    }
  }

  private loadTargetPosition() {
    const TargetPosition = this.service.getCharacteristic('TargetPosition')

    if (TargetPosition) {
      this.targetPosition = {
        value: TargetPosition.value,
        min: TargetPosition.minValue,
        max: TargetPosition.maxValue,
        step: TargetPosition.minStep,
      }

      setTimeout(() => {
        const sliderElements = document.querySelectorAll('.noUi-target')
        sliderElements.forEach((sliderElement: HTMLElement) => {
          sliderElement.style.background = 'linear-gradient(to right, #242424, #ffd6aa)'
        })
      }, 10)
    }
  }
}
