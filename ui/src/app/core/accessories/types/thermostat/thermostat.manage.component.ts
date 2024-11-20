import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { DecimalPipe, NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

@Component({
  selector: 'app-thermostat-manage',
  templateUrl: './thermostat.manage.component.html',
  styleUrls: ['./thermostat.component.scss'],
  imports: [
    NgClass,
    FormsModule,
    NouisliderComponent,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
  ],
})
export class ThermostatManageComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  public targetMode: any
  public targetTemperature: any
  public targetTemperatureChanged: Subject<string> = new Subject<string>()

  constructor() {
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
