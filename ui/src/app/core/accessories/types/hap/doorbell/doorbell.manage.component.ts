import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  templateUrl: './doorbell.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
  ],
})
export class DoorbellManageComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX

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
