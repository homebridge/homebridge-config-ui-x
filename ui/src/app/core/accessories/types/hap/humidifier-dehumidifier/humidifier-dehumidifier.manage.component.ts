import type { CharacteristicType } from '@homebridge/hap-client'

import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

@Component({
  templateUrl: './humidifier-dehumidifier.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HumidifierDehumidifierManageComponent extends BaseManageComponent {
  public type = input.required<'humidifier' | 'dehumidifier'>()

  public targetState: number
  public targetMode: number
  public targetHumidityChanged: Subject<any> = new Subject<any>()
  public targetStateValidValues: number[] = []
  public RelativeHumidityDehumidifierThreshold: CharacteristicType
  public RelativeHumidityHumidifierThreshold: CharacteristicType
  public targetDehumidifierHumidity: number
  public targetHumidifierHumidity: number
  public autoHumidity: [number, number]

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetHumidityChanged, () => {
      if (this.RelativeHumidityHumidifierThreshold) {
        void this.service.getCharacteristic('RelativeHumidityHumidifierThreshold').setValue(this.targetHumidifierHumidity)
      }
      if (this.RelativeHumidityDehumidifierThreshold) {
        void this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold').setValue(this.targetDehumidifierHumidity)
      }
    })

    this.targetState = this.service.values.Active
    this.targetMode = this.service.values.TargetHumidifierDehumidifierState
    this.RelativeHumidityDehumidifierThreshold = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')
    this.RelativeHumidityHumidifierThreshold = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')
    this.targetStateValidValues = this.service.getCharacteristic('TargetHumidifierDehumidifierState').validValues as number[]
    this.loadTargetHumidity()
    this.applySliderGradient('linear-gradient(to left, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))')
  }

  protected handleAccessoryUpdate() {
    this.targetState = this.service.values.Active
    this.targetMode = this.service.values.TargetHumidifierDehumidifierState
    this.targetDehumidifierHumidity = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')?.value as number
    this.targetHumidifierHumidity = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')?.value as number
    this.autoHumidity = [this.targetHumidifierHumidity, this.targetDehumidifierHumidity]

    // Apply gradient when mode changes externally
    this.applySliderGradient('linear-gradient(to left, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))')
  }

  private loadTargetHumidity() {
    this.targetDehumidifierHumidity = this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')?.value as number
    this.targetHumidifierHumidity = this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')?.value as number
    this.autoHumidity = [this.targetHumidifierHumidity, this.targetDehumidifierHumidity]
  }

  public setTargetState(value: number, event: MouseEvent) {
    this.targetState = value
    void this.service.getCharacteristic('Active').setValue(this.targetState)
    this.loadTargetHumidity()

    this.blurTarget(event)
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    void this.service.getCharacteristic('TargetHumidifierDehumidifierState').setValue(this.targetMode)
    this.loadTargetHumidity()

    this.blurTarget(event)

    // Apply gradient to the new slider after it's created
    this.applySliderGradient('linear-gradient(to left, rgb(80, 80, 179), rgb(173, 216, 230), rgb(255, 185, 120), rgb(139, 90, 60))')
  }

  public onHumidityStateChange() {
    this.autoHumidity = [this.targetHumidifierHumidity, this.targetDehumidifierHumidity]
    this.targetHumidityChanged.next(undefined)
  }

  public onAutoHumidityStateChange() {
    this.targetHumidifierHumidity = this.autoHumidity[0]
    this.targetDehumidifierHumidity = this.autoHumidity[1]
    this.targetHumidityChanged.next(undefined)
  }
}
