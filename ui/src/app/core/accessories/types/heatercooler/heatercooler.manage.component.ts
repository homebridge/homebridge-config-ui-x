import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

@Component({
  selector: 'app-heatercooler-manage',
  templateUrl: './heatercooler.manage.component.html',
  styleUrls: ['./heatercooler.component.scss'],
})
export class HeaterCoolerManageComponent implements OnInit {
  @Input() public service: ServiceTypeX
  public targetMode: any
  public targetTemperatureChanged: Subject<any> = new Subject<any>()

  public CoolingThresholdTemperature
  public HeatingThresholdTemperature

  public targetCoolingTemp: number
  public targetHeatingTemp: number
  public autoTemp: [number, number]

  constructor(
    public activeModal: NgbActiveModal,
  ) {
    this.targetTemperatureChanged
      .pipe(
        debounceTime(300),
      )
      .subscribe(() => {
        switch (this.targetMode) {
          case 0:
            // auto
            this.service.getCharacteristic('HeatingThresholdTemperature').setValue(this.autoTemp[0])
            this.service.getCharacteristic('CoolingThresholdTemperature').setValue(this.autoTemp[1])
            break
          case 1:
            // heat
            this.service.getCharacteristic('HeatingThresholdTemperature').setValue(this.targetHeatingTemp)
            break
          case 2:
            // cool
            this.service.getCharacteristic('CoolingThresholdTemperature').setValue(this.targetCoolingTemp)
            break
        }
      })
  }

  ngOnInit() {
    this.targetMode = this.service.values.Active ? this.service.values.TargetHeaterCoolerState : 'off'

    this.CoolingThresholdTemperature = this.service.getCharacteristic('CoolingThresholdTemperature')
    this.HeatingThresholdTemperature = this.service.getCharacteristic('HeatingThresholdTemperature')

    this.loadTargetTemperature()
  }

  loadTargetTemperature() {
    this.targetCoolingTemp = this.service.getCharacteristic('CoolingThresholdTemperature')?.value as number
    this.targetHeatingTemp = this.service.getCharacteristic('HeatingThresholdTemperature')?.value as number
    this.autoTemp = [this.targetHeatingTemp, this.targetCoolingTemp]
  }

  onTargetStateChange() {
    if (this.targetMode === 'off') {
      this.service.getCharacteristic('Active').setValue(0)
    } else {
      if (this.service.getCharacteristic('Active').value === 0) {
        this.service.getCharacteristic('Active').setValue(1)
      }
      this.service.getCharacteristic('TargetHeaterCoolerState').setValue(this.targetMode)
    }

    this.loadTargetTemperature()
  }

  onTemperatureStateChange() {
    this.targetTemperatureChanged.next(undefined)
  }
}
