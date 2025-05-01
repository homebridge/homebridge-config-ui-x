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
  selector: 'app-valve-manage',
  templateUrl: './valve.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
  ],
})
export class ValveManageComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  public targetMode: any
  public targetSetDuration: any
  public targetSetDurationChanged: Subject<string> = new Subject<string>()

  constructor() {
    this.targetSetDurationChanged
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
      )
  }

  ngOnInit() {
    this.targetMode = this.service.values.Active

    this.loadTargetBrightness()
  }

  loadTargetSetDuration() {
    const TargetSetDuration = this.service.getCharacteristic('SetDuration')

    if (TargetSetDuration) {
      this.targetSetDuration = {
        value: TargetSetDuration.value,
        min: TargetSetDuration.minValue,
        max: TargetSetDuration.maxValue,
        step: TargetSetDuration.minStep,
      }
    }
  }

  setTargetMode(value: boolean) {
    this.targetMode = value
    this.service.getCharacteristic('Active').setValue(this.targetMode)
  }

  onSetDurationStateChange() {
    this.targetSetDurationChanged.next(this.targetSetDuration.value)
  }
}
