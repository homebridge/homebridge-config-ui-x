import type { CharacteristicType } from '@homebridge/hap-client'
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { DecimalPipe, NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

@Component({
  selector: 'app-heatercooler-manage',
  templateUrl: './heatercooler.manage.component.html',
  styleUrls: ['./heatercooler.component.scss'],
  imports: [
    NgClass,
    FormsModule,
    NouisliderComponent,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
  ],
})
export class HeaterCoolerManageComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  public targetMode: any
  public targetTemperatureChanged: Subject<any> = new Subject<any>()

  public CoolingThresholdTemperature: CharacteristicType
  public HeatingThresholdTemperature: CharacteristicType

  public targetCoolingTemp: number
  public targetHeatingTemp: number
  public autoTemp: [number, number]

  constructor() {
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
