import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { getFanPercentSetting, isFanOn, setFanSpeed } from '@/app/core/accessories/types/matter/matter-device.utils'

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
export class MatterFanManageComponent extends BaseManageComponent {
  private $toastr = inject(ToastrService)

  public targetMode: boolean
  public targetSpeed: {
    value: number
    min: number
    max: number
    step: number
  }

  public targetSpeedChanged: Subject<number> = new Subject<number>()

  protected setupComponent() {
    this.createDebouncedSubscription(
      this.targetSpeedChanged,
      async () => {
        const previousSpeed = getFanPercentSetting(this.service)
        try {
          await setFanSpeed(this.service, this.targetSpeed.value)
        } catch (error) {
          this.$toastr.error('Failed to set fan speed', 'Error')
          // Revert to previous value on error
          this.targetSpeed.value = previousSpeed
          this.targetMode = previousSpeed > 0
          this.cdr.markForCheck()
        }
      },
    )

    this.targetMode = isFanOn(this.service)
    this.loadSpeed()
  }

  protected handleAccessoryUpdate() {
    this.targetMode = isFanOn(this.service)
    if (this.targetSpeed) {
      this.targetSpeed.value = getFanPercentSetting(this.service)
    }
  }

  public async setTargetMode(value: boolean, event: MouseEvent) {
    const previousMode = this.targetMode
    const previousSpeed = this.targetSpeed.value

    try {
      this.targetMode = value

      if (value) {
        // Turn on - set to 100% if currently 0%
        const speed = this.targetSpeed.value || 100
        await setFanSpeed(this.service, speed)
        this.targetSpeed.value = speed
      } else {
        // Turn off
        await setFanSpeed(this.service, 0)
        this.targetSpeed.value = 0
      }

      this.blurTarget(event)
    } catch (error) {
      this.$toastr.error(`Failed to turn fan ${value ? 'on' : 'off'}`, 'Error')
      // Revert to previous state on error
      this.targetMode = previousMode
      this.targetSpeed.value = previousSpeed
      this.cdr.markForCheck()
    }
  }

  public onTargetSpeedChange() {
    this.targetSpeedChanged.next(this.targetSpeed.value)

    // Update targetMode based on speed
    this.targetMode = this.targetSpeed.value > 0
  }

  private loadSpeed() {
    this.targetSpeed = {
      value: getFanPercentSetting(this.service),
      min: 0,
      max: 100,
      step: 1,
    }

    this.applySliderGradient('linear-gradient(to right, #add8e6, #416bdf)')
  }
}
