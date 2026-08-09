import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import {
  getWindowCoveringPercentage,
  getWindowCoveringTiltPercentage,
  hasWindowCoveringLift,
  hasWindowCoveringTilt,
  setWindowCoveringPosition,
  setWindowCoveringTiltPosition,
} from '@/app/core/accessories/types/matter/matter-device.utils'

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
  public targetPositionChanged: Subject<number> = new Subject<number>()
  public targetPosition!: {
    value: number
    min: number
    max: number
    step: number
  }

  public targetTiltChanged: Subject<number> = new Subject<number>()
  public targetTilt!: {
    value: number
    min: number
    max: number
    step: number
  }

  /**
   * A covering may lift, tilt, or do both, so the modal shows only the sliders
   * the device actually has - writing a position it has no feature for is
   * rejected by the cluster.
   */
  public supportsLift = false
  public supportsTilt = false

  protected setupComponent() {
    this.supportsLift = hasWindowCoveringLift(this.service)
    this.supportsTilt = hasWindowCoveringTilt(this.service)

    // A covering with neither feature would leave an empty modal, so fall back
    // to the lift slider rather than showing nothing at all
    if (!this.supportsLift && !this.supportsTilt) {
      this.supportsLift = true
    }

    this.loadTargetPosition()

    // Subscribe to target position changes with debounce
    this.createDebouncedSubscription(
      this.targetPositionChanged,
      async () => {
        const previousPosition = getWindowCoveringPercentage(this.service)
        try {
          await setWindowCoveringPosition(this.service, this.targetPosition.value)
        } catch (error) {
          this.showGenericErrorToast(error)
          // Revert to previous value on error
          this.targetPosition.value = previousPosition
          this.cdr.markForCheck()
        }
      },
    )

    this.createDebouncedSubscription(
      this.targetTiltChanged,
      async () => {
        const previousTilt = getWindowCoveringTiltPercentage(this.service)
        try {
          await setWindowCoveringTiltPosition(this.service, this.targetTilt.value)
        } catch (error) {
          this.showGenericErrorToast(error)
          // Revert to previous value on error
          this.targetTilt.value = previousTilt
          this.cdr.markForCheck()
        }
      },
    )
  }

  protected handleAccessoryUpdate() {
    if (this.targetPosition) {
      this.targetPosition.value = getWindowCoveringPercentage(this.service)
    }
    if (this.targetTilt) {
      this.targetTilt.value = getWindowCoveringTiltPercentage(this.service)
    }
  }

  public onTargetPositionChange() {
    this.targetPositionChanged.next(this.targetPosition.value)
  }

  public onTargetTiltChange() {
    this.targetTiltChanged.next(this.targetTilt.value)
  }

  private loadTargetPosition() {
    this.targetPosition = {
      value: getWindowCoveringPercentage(this.service),
      min: 0,
      max: 100,
      step: 1,
    }

    this.targetTilt = {
      value: getWindowCoveringTiltPercentage(this.service),
      min: 0,
      max: 100,
      step: 1,
    }

    this.applySliderGradient('linear-gradient(to right, #242424, #ffd6aa)')
  }

  public get currentPosition(): number {
    return getWindowCoveringPercentage(this.service)
  }

  public get currentTilt(): number {
    return getWindowCoveringTiltPercentage(this.service)
  }

  /**
   * What the open/closed summary at the top of the modal reports. A tilt-only
   * blind has no lift position, and its unset default would otherwise read as
   * fully open.
   */
  public get summaryPercentage(): number {
    return this.supportsLift ? this.currentPosition : this.currentTilt
  }
}
