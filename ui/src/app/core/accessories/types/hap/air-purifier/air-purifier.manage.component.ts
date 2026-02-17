import type { SliderControlConfig } from '@/app/core/accessories/accessories.interfaces'

import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

@Component({
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './air-purifier.manage.component.html',
  styleUrl: './air-purifier.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AirPurifierManageComponent extends BaseManageComponent {
  public targetState: number
  public targetMode: number
  public targetModeValidValues: number[] = []
  public targetRotationSpeed: SliderControlConfig
  public targetRotationSpeedChanged: Subject<number> = new Subject<number>()

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetRotationSpeedChanged, () => {
      void this.service.getCharacteristic('RotationSpeed').setValue(this.targetRotationSpeed.value)

      // Turn the air purifier on or off when rotation speed is adjusted
      if (this.targetRotationSpeed.value && !this.targetState) {
        this.targetState = 1
        if ('Active' in this.service.values) {
          void this.service.getCharacteristic('Active').setValue(1)
        } else if ('On' in this.service.values) {
          void this.service.getCharacteristic('On').setValue(true)
        }
      } else if (!this.targetRotationSpeed.value && this.targetState) {
        this.targetState = 0
        if ('Active' in this.service.values) {
          void this.service.getCharacteristic('Active').setValue(0)
        } else if ('On' in this.service.values) {
          void this.service.getCharacteristic('On').setValue(false)
        }
      }
    })

    this.targetState = 'Active' in this.service.values
      ? this.service.values.Active
      : (this.service.values.On ? 1 : 0)
    this.targetMode = this.service.values.TargetAirPurifierState
    if ('TargetAirPurifierState' in this.service.values) {
      this.targetModeValidValues = this.service.getCharacteristic('TargetAirPurifierState').validValues as number[]
    }
    this.loadRotationSpeed()
  }

  protected handleAccessoryUpdate() {
    this.targetState = 'Active' in this.service.values
      ? this.service.values.Active
      : (this.service.values.On ? 1 : 0)
    this.targetMode = this.service.values.TargetAirPurifierState
    if (this.targetRotationSpeed) {
      this.targetRotationSpeed.value = this.service.getCharacteristic('RotationSpeed')?.value as number
    }
  }

  public setTargetState(value: number, event: MouseEvent) {
    this.targetState = value
    if ('Active' in this.service.values) {
      void this.service.getCharacteristic('Active').setValue(this.targetState)
    } else if ('On' in this.service.values) {
      void this.service.getCharacteristic('On').setValue(this.targetState === 1)
    }

    this.blurTarget(event)
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    void this.service.getCharacteristic('TargetAirPurifierState').setValue(this.targetMode)

    this.blurTarget(event)
  }

  public onTargetRotationSpeedChange() {
    this.targetRotationSpeedChanged.next(this.targetRotationSpeed.value)
  }

  private loadRotationSpeed() {
    const RotationSpeed = this.service.getCharacteristic('RotationSpeed')
    if (RotationSpeed) {
      this.targetRotationSpeed = {
        value: RotationSpeed.value as number,
        min: RotationSpeed.minValue,
        max: RotationSpeed.maxValue,
        step: RotationSpeed.minStep,
      }
      this.applySliderGradient('linear-gradient(to right, #add8e6, #416bdf)')
    }
  }
}
