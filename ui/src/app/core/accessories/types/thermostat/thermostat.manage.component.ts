import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

@Component({
  selector: 'app-thermostat-manage',
  templateUrl: './thermostat.manage.component.html',
  styleUrls: ['./thermostat.component.scss'],
})
export class ThermostatManageComponent implements OnInit {
  @Input() public service: ServiceTypeX
  public targetMode: any
  public targetTemperature: any
  public targetTemperatureChanged: Subject<string> = new Subject<string>()

  constructor(
    public activeModal: NgbActiveModal,
  ) {
    this.targetTemperatureChanged
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        this.service.getCharacteristic('TargetTemperature').setValue(this.targetTemperature.value)
      })
  }

  ngOnInit() {
    this.targetMode = this.service.values.TargetHeatingCoolingState
    this.loadTargetTemperature()
  }

  loadTargetTemperature() {
    const TargetTemperature = this.service.getCharacteristic('TargetTemperature')

    this.targetTemperature = {
      value: TargetTemperature.value,
      min: TargetTemperature.minValue,
      max: TargetTemperature.maxValue,
      step: TargetTemperature.minStep,
    }
  }

  onTargetStateChange() {
    this.service.getCharacteristic('TargetHeatingCoolingState').setValue(this.targetMode)
  }

  onTemperatureStateChange() {
    this.targetTemperatureChanged.next(this.targetTemperature.value)
  }
}
