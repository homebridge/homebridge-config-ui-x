import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

@Component({
  selector: 'app-fanv2-manage',
  templateUrl: './fanv2.manage.component.html',
  styleUrls: ['./fanv2.component.scss'],
})
export class Fanv2ManageComponent implements OnInit {
  @Input() public service: ServiceTypeX
  public targetMode: any
  public targetRotationSpeed: any
  public targetRotationSpeedChanged: Subject<string> = new Subject<string>()

  constructor(
    public activeModal: NgbActiveModal,
  ) {
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
        unit: RotationSpeed.unit,
      }
    }
  }

  onTargetStateChange() {
    this.service.getCharacteristic('Active').setValue(this.targetMode)

    // set the rotation speed to max if on 0% when turned on
    if (this.targetMode && this.targetRotationSpeed && !this.targetRotationSpeed.value) {
      this.targetRotationSpeed.value = this.service.getCharacteristic('RotationSpeed').maxValue
    }
  }

  onTargetRotationSpeedChange() {
    this.targetRotationSpeedChanged.next(this.targetRotationSpeed.value)
  }
}
