import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'

import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

@Component({
  selector: 'app-airpurifier-manage',
  templateUrl: './airpurifier.manage.component.html',
  styleUrls: ['./airpurifier.component.scss'],
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
})
export class AirpurifierManageComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  public targetMode: any
  public targetRotationSpeed: any
  public targetRotationSpeedChanged: Subject<string> = new Subject<string>()

  constructor() {
    this.targetRotationSpeedChanged
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        this.service.getCharacteristic('RotationSpeed').setValue(this.targetRotationSpeed.value)

        // turn bulb on or off when brightness is adjusted
        if (this.targetRotationSpeed.value && !this.service.values.Active) {
          this.targetMode = 1
          this.service.getCharacteristic('Active').setValue(this.targetMode)
        } else if (!this.targetRotationSpeed.value && this.service.values.Active) {
          this.targetMode = 0
          this.service.getCharacteristic('Active').setValue(this.targetMode)
        }
      })
  }

  ngOnInit() {
    this.targetMode = this.service.values.Active

    this.loadRotationSpeed()
  }

  loadRotationSpeed() {
    const RotationSpeed = this.service.getCharacteristic('RotationSpeed')

    if (RotationSpeed) {
      this.targetRotationSpeed = {
        value: RotationSpeed.value,
        min: RotationSpeed.minValue,
        max: RotationSpeed.maxValue,
        step: RotationSpeed.minStep,
      }
    }
  }

  onTargetStateChange() {
    this.service.getCharacteristic('Active').setValue(this.targetMode)

    // set the brightness to 100% if on 0% when turned on
    if (this.targetMode && this.targetRotationSpeed && !this.targetRotationSpeed.value) {
      this.targetRotationSpeed.value = 100
    }
  }

  onTargetRotationSpeedChange() {
    this.targetRotationSpeedChanged.next(this.targetRotationSpeed.value)
  }
}
