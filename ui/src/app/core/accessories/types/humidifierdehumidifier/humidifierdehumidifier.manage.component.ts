import type { CharacteristicType } from '@homebridge/hap-client'
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

@Component({
  selector: 'app-humidifierdehumidifier-manage',
  templateUrl: './humidifierdehumidifier.manage.component.html',
  styleUrls: ['./humidifierdehumidifier.component.scss'],
  imports: [
    NgClass,
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
})
export class HumidifierDehumidifierManageComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  public targetMode: any
  public targetHumidityChanged: Subject<any> = new Subject<any>()

  public RelativeHumidityDehumidifierThreshold: CharacteristicType
  public RelativeHumidityHumidifierThreshold: CharacteristicType

  public targetDehumidifierHumidity: number
  public targetHumidifierHumidity: number
  public autoHumidity: [number, number]

  constructor() {
    this.targetHumidityChanged
      .pipe(
        debounceTime(300),
      )
      .subscribe(() => {
        switch (this.targetMode) {
          case 0:
            // auto
            this.service.getCharacteristic('RelativeHumidityHumidifierThreshold').setValue(this.autoHumidity[0])
            this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold').setValue(this.autoHumidity[1])
            break
          case 1:
            // humidifier
            this.service.getCharacteristic('RelativeHumidityHumidifierThreshold').setValue(this.targetHumidifierHumidity)
            break
          case 2:
            // dehumidifier
            this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold').setValue(this.targetDehumidifierHumidity)
            break
        }
      })
  }

  ngOnInit() {
    this.targetMode = this.service.values.Active ? this.service.values.TargetHumidifierDehumidifierState : 'off'

    this.RelativeHumidityDehumidifierThreshold = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')
    this.RelativeHumidityHumidifierThreshold = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')

    this.loadTargetHumidity()
  }

  loadTargetHumidity() {
    this.targetDehumidifierHumidity = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')?.value as number
    this.targetHumidifierHumidity = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')?.value as number
    this.autoHumidity = [this.targetHumidifierHumidity, this.targetDehumidifierHumidity]
  }

  onTargetStateChange() {
    if (this.targetMode === 'off') {
      this.service.getCharacteristic('Active').setValue(0)
    } else {
      if (this.service.getCharacteristic('Active').value === 0) {
        this.service.getCharacteristic('Active').setValue(1)
      }
      this.service.getCharacteristic('TargetHumidifierDehumidifierState').setValue(this.targetMode)
    }

    this.loadTargetHumidity()
  }

  onHumidityStateChange() {
    this.targetHumidityChanged.next(undefined)
  }
}
