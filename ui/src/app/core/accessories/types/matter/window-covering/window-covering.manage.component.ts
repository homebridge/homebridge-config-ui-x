import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject, Subscription } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { getWindowCoveringPercentage, setWindowCoveringPosition } from '@/app/core/accessories/types/matter/matter-device.utils'

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

  public targetPositionChanged: Subject<number> = new Subject<number>()
  public targetPosition: {
    value: number
    min: number
    max: number
    step: number
  }

  private stateSubscription: Subscription

  constructor() {
    this.targetPositionChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        setWindowCoveringPosition(this.service, this.targetPosition.value)
      })
  }

  public ngOnInit() {
    this.loadTargetPosition()

    // Subscribe to state changes to update modal in real-time
    this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
      if (this.targetPosition) {
        this.targetPosition.value = getWindowCoveringPercentage(this.service)
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
    this.targetPosition = {
      value: getWindowCoveringPercentage(this.service),
      min: 0,
      max: 100,
      step: 1,
    }

    setTimeout(() => {
      const sliderElements = document.querySelectorAll('.noUi-target')
      sliderElements.forEach((sliderElement: HTMLElement) => {
        sliderElement.style.background = 'linear-gradient(to right, #242424, #ffd6aa)'
      })
    }, 10)
  }

  public get currentPosition(): number {
    return getWindowCoveringPercentage(this.service)
  }
}
