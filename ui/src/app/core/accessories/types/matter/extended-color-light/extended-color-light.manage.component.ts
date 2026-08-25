import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { MatterBrightness, MatterColorTemperature } from '@/app/core/accessories/types/matter/matter-device.constants'
import {
  getBrightnessLevel,
  getColorTemperatureMireds,
  getHue,
  getOnOffState,
  getSaturation,
  hasClusterFeature,
  hasColorTemperature,
  levelToPercentage,
} from '@/app/core/accessories/types/matter/matter-device.utils'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'
import { ColourService } from '@/app/core/utilities/colour.service'

@Component({
  selector: 'app-extended-color-light-manage',
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    ConvertMiredPipe,
  ],
  standalone: true,
  templateUrl: './extended-color-light.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtendedColorLightManageComponent extends BaseManageComponent {
  private $colour = inject(ColourService)

  public targetMode!: boolean
  public targetBrightness!: { value: number, min: number, max: number, step: number }
  public targetBrightnessChanged: Subject<number> = new Subject<number>()
  public targetColorTemperature!: { value: number, mired: number, min: number, max: number, step: number }
  public targetColorTemperatureChanged: Subject<number> = new Subject<number>()
  public targetHue!: { value: number, min: number, max: number, step: number }
  public targetHueChanged: Subject<number> = new Subject<number>()
  public targetSaturation!: { value: number, min: number, max: number, step: number }
  public targetSaturationChanged: Subject<number> = new Subject<number>()

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
            // A raw level write does not run Matter's on/off coupling, so a
            // slider move while off must also set onOff or the light state
            // never reads as on
            if (!getOnOffState(this.service)) {
              const onOffCluster = this.service.getCluster?.('onOff')
              if (!onOffCluster) {
                throw new Error('OnOff cluster not found')
              }
              await onOffCluster.setAttributes({ onOff: true })
            }
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

    this.createDebouncedSubscription(
      this.targetHueChanged,
      async () => {
        const previousHue = getHue(this.service)
        const previousSaturation = getSaturation(this.service)
        try {
          const cluster = this.service.getCluster?.('colorControl')
          if (!cluster) {
            throw new Error('ColorControl cluster not found')
          }
          await cluster.setAttributes({
            currentHue: this.targetHue.value,
            currentSaturation: this.targetSaturation.value,
          })
        } catch (error) {
          this.showGenericErrorToast(error)
          // Revert to previous values on error
          this.targetHue.value = previousHue
          this.targetSaturation.value = previousSaturation
          this.updateSaturationSliderGradient()
          this.cdr.markForCheck()
        }
      },
      300,
    )

    this.createDebouncedSubscription(
      this.targetSaturationChanged,
      async () => {
        const previousHue = getHue(this.service)
        const previousSaturation = getSaturation(this.service)
        try {
          const cluster = this.service.getCluster?.('colorControl')
          if (!cluster) {
            throw new Error('ColorControl cluster not found')
          }
          await cluster.setAttributes({
            currentHue: this.targetHue.value,
            currentSaturation: this.targetSaturation.value,
          })
        } catch (error) {
          this.showGenericErrorToast(error)
          // Revert to previous values on error
          this.targetHue.value = previousHue
          this.targetSaturation.value = previousSaturation
          this.cdr.markForCheck()
        }
      },
      300,
    )

    this.targetMode = getOnOffState(this.service)
    this.loadTargetBrightness()
    if (this.supportsColorTemperature) {
      this.loadTargetColorTemperature()
    }
    this.loadTargetHueSaturation()
  }

  protected handleAccessoryUpdate() {
    this.targetMode = getOnOffState(this.service)
    this.targetBrightness.value = getBrightnessLevel(this.service)

    if (this.supportsColorTemperature) {
      const newMired = getColorTemperatureMireds(this.service)
      this.targetColorTemperature.mired = newMired
      this.targetColorTemperature.value = this.$colour.miredToKelvin(newMired)
    }

    const newHue = getHue(this.service)
    if (this.targetHue.value !== newHue) {
      this.targetHue.value = newHue
      // Update saturation slider gradient when hue changes externally
      this.updateSaturationSliderGradient()
    }

    this.targetSaturation.value = getSaturation(this.service)
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
        const onOffCluster = this.service.getCluster?.('onOff')
        if (!cluster || !onOffCluster) {
          throw new Error(!cluster ? 'LevelControl cluster not found' : 'OnOff cluster not found')
        }
        // Both writes are needed: a raw level write does not run Matter's
        // on/off coupling (only the moveToLevelWithOnOff command does that)
        await cluster.setAttributes({ currentLevel: targetLevel })
        await onOffCluster.setAttributes({ onOff: true })
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

  public onHueStateChange() {
    this.targetHueChanged.next(this.targetHue.value)

    // Update saturation slider gradient to reflect new hue
    this.updateSaturationSliderGradient()
  }

  public onSaturationStateChange() {
    this.targetSaturationChanged.next(this.targetSaturation.value)
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

  private loadTargetHueSaturation() {
    const currentHue = getHue(this.service)
    const currentSaturation = getSaturation(this.service)

    this.targetHue = {
      value: currentHue,
      min: 0,
      max: 254,
      step: 1,
    }

    this.targetSaturation = {
      value: currentSaturation,
      min: 0,
      max: 254,
      step: 1,
    }

    // Style the hue slider with a rainbow gradient
    this.applySliderGradient('linear-gradient(to right, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))', '.hue-slider .noUi-target')

    // Style the saturation slider from white to current hue
    this.updateSaturationSliderGradient()
  }

  public get brightnessPercentage(): number {
    return levelToPercentage(this.targetBrightness.value)
  }

  public get huePercentage(): number {
    return Math.round((this.targetHue.value / 254) * 100)
  }

  public get saturationPercentage(): number {
    return Math.round((this.targetSaturation.value / 254) * 100)
  }

  public get supportsColorTemperature(): boolean {
    // Gate on the registered feature where Homebridge reports it, falling back
    // to the declared attribute on versions that do not
    return hasClusterFeature(this.service, 'colorControl', 'colorTemperature', hasColorTemperature(this.service))
  }

  /**
   * Hue and saturation ride on the HueSaturation feature. An ExtendedColorLight
   * normally has it, but a plugin composing ColorControl itself may not, and
   * writing hue to a cluster without the feature is rejected.
   */
  public get supportsHueSaturation(): boolean {
    return hasClusterFeature(
      this.service,
      'colorControl',
      'hueSaturation',
      this.service.clusters?.colorControl?.currentHue !== undefined,
    )
  }

  /**
   * Update the saturation slider gradient to match the current hue
   */
  private updateSaturationSliderGradient() {
    const hDegrees = (this.targetHue.value / 254) * 360
    // White at zero saturation, not grey - matching how the tile paints the bulb
    this.applySliderGradient(`linear-gradient(to right, ${this.$colour.hueSaturationToHsl(hDegrees, 0)}, ${this.$colour.hueSaturationToHsl(hDegrees, 100)})`, '.saturation-slider .noUi-target')
  }
}
