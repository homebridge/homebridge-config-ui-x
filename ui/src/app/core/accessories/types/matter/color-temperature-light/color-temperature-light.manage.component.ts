import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { MatterBrightness, MatterColorTemperature } from '@/app/core/accessories/types/matter/matter-device.constants'
import { getBrightnessLevel, getColorTemperatureMireds, getOnOffState, levelToPercentage } from '@/app/core/accessories/types/matter/matter-device.utils'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'
import { ColourService } from '@/app/core/utilities/colour.service'

@Component({
  selector: 'app-color-temperature-light-manage',
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    ConvertMiredPipe,
  ],
  standalone: true,
  templateUrl: './color-temperature-light.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorTemperatureLightManageComponent extends BaseManageComponent {
  private $colour = inject(ColourService)

  public targetMode!: boolean
  public targetBrightness!: { value: number, min: number, max: number, step: number }
  public targetBrightnessChanged: Subject<number> = new Subject<number>()
  public targetColorTemperature!: { value: number, mired: number, min: number, max: number, step: number }
  public targetColorTemperatureChanged: Subject<number> = new Subject<number>()

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
          this.showGenericErrorToast(error)
          // Revert to previous value on error
          this.targetBrightness.value = previousBrightness
          this.targetMode = previousBrightness > 0
          this.cdr.markForCheck()
        }
      },
      300,
    )

    this.createDebouncedSubscription(
      this.targetColorTemperatureChanged,
      async (miredValue) => {
        const previousMired = getColorTemperatureMireds(this.service)
        try {
          const cluster = this.service.getCluster?.('colorControl')
          if (!cluster) {
            throw new Error('ColorControl cluster not found')
          }
          await cluster.setAttributes({ colorTemperatureMireds: miredValue })
        } catch (error) {
          this.showGenericErrorToast(error)
          // Revert to previous value on error
          this.targetColorTemperature.mired = previousMired
          this.targetColorTemperature.value = this.$colour.miredToKelvin(previousMired)
          this.cdr.markForCheck()
        }
      },
      300,
    )

    this.targetMode = getOnOffState(this.service)
    this.loadTargetBrightness()
    this.loadTargetColorTemperature()
  }

  protected handleAccessoryUpdate() {
    this.targetMode = getOnOffState(this.service)
    this.targetBrightness.value = getBrightnessLevel(this.service)

    const newMired = getColorTemperatureMireds(this.service)
    this.targetColorTemperature.mired = newMired
    this.targetColorTemperature.value = this.$colour.miredToKelvin(newMired)
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
      this.showGenericErrorToast(error)
      // Revert to previous state on error
      this.targetMode = previousMode
      this.targetBrightness.value = previousBrightness
      this.cdr.markForCheck()
    }
  }

  public onBrightnessStateChange() {
    this.targetBrightnessChanged.next(this.targetBrightness.value)
  }

  public onColorTemperatureStateChange() {
    const miredValue = this.$colour.kelvinToMired(this.targetColorTemperature.value)
    this.targetColorTemperature.mired = miredValue
    this.targetColorTemperatureChanged.next(miredValue)
  }

  private loadTargetBrightness() {
    const currentLevel = getBrightnessLevel(this.service)

    this.targetBrightness = {
      value: currentLevel,
      min: MatterBrightness.Min,
      max: MatterBrightness.Max,
      step: 1,
    }

    this.applySliderGradient('linear-gradient(to right, #242424, #ffd6aa)', '.brightness-slider .noUi-target')
  }

  private loadTargetColorTemperature() {
    const currentMired = getColorTemperatureMireds(this.service)

    // Here, the min and max are switched because mired and kelvin are inversely related
    this.targetColorTemperature = {
      value: this.$colour.miredToKelvin(currentMired),
      mired: currentMired,
      min: this.$colour.miredToKelvin(MatterColorTemperature.MaxMired), // ~2000K
      max: this.$colour.miredToKelvin(MatterColorTemperature.MinMired), // ~6800K
      step: 10,
    }

    const minHsl = this.$colour.kelvinToHsl(this.targetColorTemperature.min)
    const maxHsl = this.$colour.kelvinToHsl(this.targetColorTemperature.max)
    this.applySliderGradient(`linear-gradient(to right, ${minHsl}, ${maxHsl})`, '.color-temp-slider .noUi-target')
  }

  public get brightnessPercentage(): number {
    return levelToPercentage(this.targetBrightness.value)
  }
}
