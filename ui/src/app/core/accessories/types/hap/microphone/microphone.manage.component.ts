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
  templateUrl: './microphone.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
  ],
})
export class MicrophoneManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  @Input() public $accessories: AccessoriesService

  private stateSubscription: Subscription

  public targetMode: any
  public targetVolume: any
  public targetVolumeChanged: Subject<string> = new Subject<string>()

  constructor() {
    this.targetVolumeChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        this.service.getCharacteristic('Volume').setValue(this.targetVolume.value)
      })
  }

  public ngOnInit() {
    this.targetMode = this.service.values.Mute
    this.loadTargetVolume()

    // Subscribe to real-time accessory updates
    if (this.$accessories) {
      this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
        this.targetMode = this.service.values.Mute
        if (this.targetVolume) {
          this.targetVolume.value = this.service.getCharacteristic('Volume')?.value
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
    this.service.getCharacteristic('Mute').setValue(this.targetMode)

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public setActive(value: number, event: MouseEvent) {
    this.service.getCharacteristic('Active').setValue(value)

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public setTargetState(value: number, event: MouseEvent) {
    this.service.getCharacteristic('TargetMediaState').setValue(value)

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public onVolumeStateChange() {
    this.targetVolumeChanged.next(this.targetVolume.value)
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private loadTargetVolume() {
    const TargetVolume = this.service.getCharacteristic('Volume')
    if (TargetVolume) {
      this.targetVolume = {
        value: TargetVolume.value,
        min: TargetVolume.minValue,
        max: TargetVolume.maxValue,
        step: TargetVolume.minStep,
      }
      setTimeout(() => {
        const sliderElements = document.querySelectorAll('.noUi-target')
        sliderElements.forEach((sliderElement: HTMLElement) => {
          sliderElement.style.background = 'linear-gradient(to right, #ffffff, #ffd966, #ff0000)'
        })
      }, 10)
    }
  }
}
