import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../../accessories.interfaces';

import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-fan-manage',
  templateUrl: './fan.manage.component.html',
  styleUrls: ['./fan.component.scss'],
})
export class FanManageComponent implements OnInit {
  @Input() public service: ServiceTypeX;
  public targetMode: any;
  public targetRotationSpeed: any;
  public targetRotationSpeedChanged: Subject<string> = new Subject<string>();

  constructor(
    public activeModal: NgbActiveModal,
  ) {
    this.targetRotationSpeedChanged
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
      )
      .subscribe((value) => {
        this.service.getCharacteristic('RotationSpeed').setValue(this.targetRotationSpeed.value);

        // turn bulb on or off when brightness is adjusted
        if (this.targetRotationSpeed.value && !this.service.values.On) {
          this.targetMode = true;
          this.service.getCharacteristic('On').setValue(this.targetMode);
        } else if (!this.targetRotationSpeed.value && this.service.values.On) {
          this.targetMode = false;
          this.service.getCharacteristic('On').setValue(this.targetMode);
        }

      });
  }

  ngOnInit() {
    this.targetMode = this.service.values.On;

    this.loadRotationSpeed();
  }

  loadRotationSpeed() {
    const RotationSpeed = this.service.getCharacteristic('RotationSpeed');

    if (RotationSpeed) {
      this.targetRotationSpeed = {
        value: RotationSpeed.value,
        min: RotationSpeed.minValue,
        max: RotationSpeed.maxValue,
        step: RotationSpeed.minStep,
      };
    }
  }

  onTargetStateChange() {
    this.service.getCharacteristic('On').setValue(this.targetMode);

    // set the brightness to 100% if on 0% when turned on
    if (this.targetMode && this.targetRotationSpeed && !this.targetRotationSpeed.value) {
      this.targetRotationSpeed.value = 100;
    }
  }

  onTargetRotationSpeedChange() {
    this.targetRotationSpeedChanged.next(this.targetRotationSpeed.value);
  }

}
