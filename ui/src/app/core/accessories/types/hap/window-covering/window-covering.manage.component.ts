import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

interface TiltControl {
  value: any
  min: number
  max: number
  step: number
}

@Component({
  selector: 'app-window-covering-manage',
  imports: [
    NouisliderComponent,
    FormsModule,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './window-covering.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WindowCoveringManageComponent extends BaseManageComponent {
  public targetMode!: string
  public targetPositionChanged: Subject<string> = new Subject<string>()
  public targetPosition!: {
    value: any
    min: number
    max: number
    step: number
  }

  /**
   * Tilt is optional on the HomeKit WindowCovering service, and a blind has one
   * axis or the other rather than both, so each slider only appears when the
   * plugin actually added that characteristic. Angles are in degrees (normally
   * -90 to 90), not the percentage the position slider uses.
   */
  public targetHorizontalTilt?: TiltControl
  public targetVerticalTilt?: TiltControl
  public targetHorizontalTiltChanged: Subject<number> = new Subject<number>()
  public targetVerticalTiltChanged: Subject<number> = new Subject<number>()

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetPositionChanged, () => {
      if (this.service.getCharacteristic!('CurrentPosition')!.value < this.targetPosition.value) {
        this.service.values.PositionState = 1
      } else if (this.service.getCharacteristic!('CurrentPosition')!.value > this.targetPosition.value) {
        this.service.values.PositionState = 0
      }
      void this.service.getCharacteristic!('TargetPosition').setValue!(this.targetPosition.value)
    })

    this.createDebouncedSubscription(this.targetHorizontalTiltChanged, () => {
      void this.service.getCharacteristic!('TargetHorizontalTiltAngle')?.setValue!(this.targetHorizontalTilt!.value)
    })

    this.createDebouncedSubscription(this.targetVerticalTiltChanged, () => {
      void this.service.getCharacteristic!('TargetVerticalTiltAngle')?.setValue!(this.targetVerticalTilt!.value)
    })

    this.targetMode = this.service.values.On
    this.loadTargetPosition()
    this.targetHorizontalTilt = this.loadTilt('TargetHorizontalTiltAngle')
    this.targetVerticalTilt = this.loadTilt('TargetVerticalTiltAngle')
  }

  protected handleAccessoryUpdate() {
    this.targetMode = this.service.values.On
    if (this.targetPosition && 'TargetPosition' in this.service.values) {
      this.targetPosition.value = this.service.getCharacteristic!('TargetPosition').value
    }
    if (this.targetHorizontalTilt && 'TargetHorizontalTiltAngle' in this.service.values) {
      this.targetHorizontalTilt.value = this.service.getCharacteristic!('TargetHorizontalTiltAngle').value
    }
    if (this.targetVerticalTilt && 'TargetVerticalTiltAngle' in this.service.values) {
      this.targetVerticalTilt.value = this.service.getCharacteristic!('TargetVerticalTiltAngle').value
    }
  }

  public onTargetPositionChange() {
    this.targetPositionChanged.next(this.targetPosition.value)
  }

  public onTargetHorizontalTiltChange() {
    this.targetHorizontalTiltChanged.next(this.targetHorizontalTilt!.value)
  }

  public onTargetVerticalTiltChange() {
    this.targetVerticalTiltChanged.next(this.targetVerticalTilt!.value)
  }

  private loadTargetPosition() {
    const TargetPosition = this.service.getCharacteristic!('TargetPosition')

    if (TargetPosition) {
      this.targetPosition = {
        value: TargetPosition.value,
        min: TargetPosition.minValue as number,
        max: TargetPosition.maxValue as number,
        step: TargetPosition.minStep as number,
      }

      this.applySliderGradient('linear-gradient(to right, #242424, #ffd6aa)')
    }
  }

  /**
   * Build a tilt slider, or nothing at all when the accessory does not expose
   * that axis. The bounds come from the characteristic rather than the -90..90
   * default, so an accessory that narrows them is respected.
   */
  private loadTilt(name: string): TiltControl | undefined {
    const characteristic = this.service.getCharacteristic!(name)

    if (!characteristic) {
      return undefined
    }

    return {
      value: characteristic.value,
      min: characteristic.minValue as number,
      max: characteristic.maxValue as number,
      step: (characteristic.minStep as number) || 1,
    }
  }

  public get currentHorizontalTilt(): number {
    return this.service.getCharacteristic!('CurrentHorizontalTiltAngle')?.value as number
  }

  public get currentVerticalTilt(): number {
    return this.service.getCharacteristic!('CurrentVerticalTiltAngle')?.value as number
  }
}
