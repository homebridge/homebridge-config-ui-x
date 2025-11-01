import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
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
export class ValveManageComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX

  public targetMode: any
  public targetSetDuration: any
  public targetSetDurationChanged: Subject<string> = new Subject<string>()

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
