import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { MatterBrightness } from '@/app/core/accessories/types/matter/matter-device.constants'
import { getBrightnessLevel, getOnOffState, levelToPercentage } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-dimmable-light-manage',
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './dimmable-light.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DimmableLightManageComponent extends BaseManageComponent {
  private $toastr = inject(ToastrService)

  public targetMode!: boolean
  public targetBrightness!: { value: number, min: number, max: number, step: number }
  public targetBrightnessChanged: Subject<number> = new Subject<number>()

  protected setupComponent() {
    this.createDebouncedSubscription(
      this.targetBrightnessChanged,
      async () => {
        const previousBrightness = getBrightnessLevel(this.service)
        try {
          if (this.targetBrightness.value === MatterBrightness.Min) {
            // Turning off - use onOff cluster
            const cluster = this.service.getCluster?.('onOff')
            if (!cluster) {
              throw new Error('OnOff cluster not found')
            }
            await cluster.setAttributes({ onOff: false })
          } else {
            // Setting brightness - use levelControl cluster
            const cluster = this.service.getCluster?.('levelControl')
            if (!cluster) {
              throw new Error('LevelControl cluster not found')
            }
            await cluster.setAttributes({ currentLevel: this.targetBrightness.value })
          }

          // Update local state
          this.targetMode = this.targetBrightness.value > 0
        } catch (error) {
          this.$toastr.error('Failed to set light brightness', 'Error')
          // Revert to previous value on error
          this.targetBrightness.value = previousBrightness
          this.targetMode = previousBrightness > 0
          this.cdr.markForCheck()
        }
      },
      300,
    )

    this.targetMode = getOnOffState(this.service)
    this.loadTargetBrightness()
  }

  protected handleAccessoryUpdate() {
    this.targetMode = getOnOffState(this.service)
    this.targetBrightness.value = getBrightnessLevel(this.service)
  }

  public async setTargetMode(value: boolean, event: MouseEvent) {
    const previousMode = this.targetMode
    const previousBrightness = this.targetBrightness.value

    try {
      this.targetMode = value

      if (value) {
        // Turning on - set brightness to max if currently 0, otherwise keep current
        const targetLevel = this.targetBrightness.value || this.targetBrightness.max
        this.targetBrightness.value = targetLevel
        const cluster = this.service.getCluster?.('levelControl')
        if (!cluster) {
          throw new Error('LevelControl cluster not found')
        }
        await cluster.setAttributes({ currentLevel: targetLevel })
      } else {
        // Turning off - use onOff cluster instead of levelControl
        const cluster = this.service.getCluster?.('onOff')
        if (!cluster) {
          throw new Error('OnOff cluster not found')
        }
        await cluster.setAttributes({ onOff: false })
      }

      this.blurTarget(event)
    } catch (error) {
      this.$toastr.error(`Failed to turn light ${value ? 'on' : 'off'}`, 'Error')
      // Revert to previous state on error
      this.targetMode = previousMode
      this.targetBrightness.value = previousBrightness
      this.cdr.markForCheck()
    }
  }

  public onBrightnessStateChange() {
    this.targetBrightnessChanged.next(this.targetBrightness.value)
  }

  private loadTargetBrightness() {
    const currentLevel = getBrightnessLevel(this.service)

    this.targetBrightness = {
      value: currentLevel,
      min: MatterBrightness.Min,
      max: MatterBrightness.Max,
      step: 1,
    }

    this.applySliderGradient('linear-gradient(to right, #242424, #ffd6aa)')
  }

  public get brightnessPercentage(): number {
    return levelToPercentage(this.targetBrightness.value)
  }
}
