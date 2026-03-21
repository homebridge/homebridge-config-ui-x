import type { SliderControlConfig } from '@/app/core/accessories/accessories.interfaces'

import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

@Component({
  selector: 'app-fan-manage',
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './fan.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FanManageComponent extends BaseManageComponent {
  public targetMode!: boolean
  public targetRotationSpeed!: SliderControlConfig
  public targetRotationSpeedChanged: Subject<number> = new Subject<number>()
  public hasRotationDirection = false

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetRotationSpeedChanged, () => {
      void this.service.getCharacteristic!('RotationSpeed').setValue!(this.targetRotationSpeed.value)

      // Turn the fan on or off when rotation speed is adjusted
      if (this.targetRotationSpeed.value && !this.targetMode) {
        this.targetMode = true
        if ('On' in this.service.values) {
          void this.service.getCharacteristic!('On').setValue!(this.targetMode)
        } else if ('Active' in this.service.values) {
          void this.service.getCharacteristic!('Active').setValue!(this.targetMode ? 1 : 0)
        }
      } else if (!this.targetRotationSpeed.value && this.targetMode) {
        this.targetMode = false
        if ('On' in this.service.values) {
          void this.service.getCharacteristic!('On').setValue!(this.targetMode)
        } else if ('Active' in this.service.values) {
          void this.service.getCharacteristic!('Active').setValue!(this.targetMode ? 1 : 0)
        }
      }
    })

    this.targetMode = ('On' in this.service.values)
      ? this.service.values.On
      : this.service.values.Active === 1

    this.loadRotationSpeed()

    if ('RotationDirection' in this.service.values) {
      this.hasRotationDirection = true
    }
  }

  protected handleAccessoryUpdate() {
    this.targetMode = ('On' in this.service.values)
      ? this.service.values.On
      : this.service.values.Active === 1
    if (this.targetRotationSpeed) {
      this.targetRotationSpeed.value = this.service.getCharacteristic!('RotationSpeed')?.value as number
    }
  }

  public setTargetMode(value: boolean, event: MouseEvent) {
    this.targetMode = value

    if ('On' in this.service.values) {
      void this.service.getCharacteristic!('On').setValue!(this.targetMode)
    } else if ('Active' in this.service.values) {
      void this.service.getCharacteristic!('Active').setValue!(this.targetMode ? 1 : 0)
    }

    // Set the rotation speed to max if on 0% when turned on
    if (this.targetMode && this.targetRotationSpeed && !this.targetRotationSpeed.value) {
      this.targetRotationSpeed.value = this.service.getCharacteristic!('RotationSpeed').maxValue as number
    }

    this.blurTarget(event)
  }

  public onTargetRotationSpeedChange() {
    this.targetRotationSpeedChanged.next(this.targetRotationSpeed.value)
  }

  public setRotationDirection(value: number, event: MouseEvent) {
    void this.service.getCharacteristic!('RotationDirection').setValue!(value)

    this.blurTarget(event)
  }

  private loadRotationSpeed() {
    const RotationSpeed = this.service.getCharacteristic!('RotationSpeed')

    if (RotationSpeed) {
      this.targetRotationSpeed = {
        value: RotationSpeed.value as number,
        min: RotationSpeed.minValue,
        max: RotationSpeed.maxValue,
        step: RotationSpeed.minStep,
        unit: RotationSpeed.unit,
      }

      this.applySliderGradient('linear-gradient(to right, #add8e6, #416bdf)')
    }
  }
}
