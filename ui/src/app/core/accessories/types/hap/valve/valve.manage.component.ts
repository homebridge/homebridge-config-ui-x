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
import { DurationPipe } from '@/app/core/pipes/duration.pipe'

@Component({
  templateUrl: './valve.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
    DurationPipe,
  ],
})
export class ValveManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  @Input() public $accessories: AccessoriesService

  public targetMode: any
  public targetSetDuration: any
  public targetSetDurationChanged: Subject<string> = new Subject<string>()
  private stateSubscription: Subscription

  constructor() {
    this.targetSetDurationChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        this.service.getCharacteristic('SetDuration').setValue(this.targetSetDuration.value)
      })
  }

  public ngOnInit() {
    this.targetMode = this.service.values.Active

    this.loadTargetSetDuration()

    // Subscribe to state changes to update modal in real-time
    this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
      this.targetMode = this.service.values.Active
      if (this.targetSetDuration && 'SetDuration' in this.service.values) {
        this.targetSetDuration.value = this.service.getCharacteristic('SetDuration').value
      }
    })
  }

  public setTargetMode(value: boolean, event: MouseEvent) {
    this.targetMode = value
    this.service.getCharacteristic('Active').setValue(this.targetMode)

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public onSetDurationStateChange() {
    this.targetSetDurationChanged.next(this.targetSetDuration.value)
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public ngOnDestroy() {
    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe()
    }
  }

  private loadTargetSetDuration() {
    const TargetSetDuration = this.service.getCharacteristic('SetDuration')

    if (TargetSetDuration) {
      this.targetSetDuration = {
        value: TargetSetDuration.value,
        min: TargetSetDuration.minValue,
        max: TargetSetDuration.maxValue,
        step: TargetSetDuration.minStep,
      }

      setTimeout(() => {
        const sliderElement = document.querySelectorAll('.noUi-target')[0] as HTMLElement
        if (sliderElement) {
          sliderElement.style.background = 'linear-gradient(to right, #add8e6, #416bdf)'
        }
      }, 10)
    }
  }
}
