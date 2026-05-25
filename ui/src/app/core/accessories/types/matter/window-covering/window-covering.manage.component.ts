import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { getWindowCoveringPercentage, setWindowCoveringPosition } from '@/app/core/accessories/types/matter/matter-device.utils'

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

  protected setupComponent() {
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
  }

  protected handleAccessoryUpdate() {
    if (this.targetPosition) {
      this.targetPosition.value = getWindowCoveringPercentage(this.service)
    }
  }

  public onTargetPositionChange() {
    this.targetPositionChanged.next(this.targetPosition.value)
  }

  private loadTargetPosition() {
    this.targetPosition = {
      value: getWindowCoveringPercentage(this.service),
      min: 0,
      max: 100,
      step: 1,
    }

    this.applySliderGradient('linear-gradient(to right, #242424, #ffd6aa)')
  }

  public get currentPosition(): number {
    return getWindowCoveringPercentage(this.service)
  }
}
