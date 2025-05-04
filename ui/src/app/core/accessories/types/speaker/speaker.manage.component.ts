import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-speaker-manage',
  templateUrl: './speaker.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
  ],
})
export class SpeakerManageComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  public targetMode: any
  public targetVolume: any
  public targetVolumeChanged: Subject<string> = new Subject<string>()
  public hasActive: any

  constructor() {
    this.targetVolumeChanged
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        this.service.getCharacteristic('Volume').setValue(this.targetVolume.value)
      })
  }

  ngOnInit() {
    this.targetMode = this.service.values.Mute

    this.loadTargetVolume()

    if (this.service.serviceCharacteristics.find(c => c.type === 'Active')) {
      this.hasActive = true
    }
  }

  loadTargetVolume() {
    const TargetVolume = this.service.getCharacteristic('Volume')

    if (TargetVolume) {
      this.targetVolume = {
        value: TargetVolume.value,
        min: TargetVolume.minValue,
        max: TargetVolume.maxValue,
        step: TargetVolume.minStep,
      }
    }
  }

  setTargetMode(value: boolean) {
    this.targetMode = value
    this.service.getCharacteristic('Mute').setValue(this.targetMode)
  }

  setActive(value: number) {
    this.service.getCharacteristic('Active').setValue(value)
  }

  onVolumeStateChange() {
    this.targetVolumeChanged.next(this.targetVolume.value)
  }
}
