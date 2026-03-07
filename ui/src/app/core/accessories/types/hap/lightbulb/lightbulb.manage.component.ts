import type {
  ColorTemperatureControlConfig,
  SimpleValueControlConfig,
  SliderControlConfig,
} from '@/app/core/accessories/accessories.interfaces'

import { ChangeDetectionStrategy, Component, inject, InjectionToken } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { BehaviorSubject, Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'
import { ColourService } from '@/app/core/utilities/colour.service'

/**
 * Injection token for lightbulb-specific modal data (optional)
 */
export const LIGHTBULB_ADAPTIVE_LIGHTING = new InjectionToken<BehaviorSubject<boolean> | undefined>(
  'LightbulbAdaptiveLighting',
  { factory: () => undefined },
)

@Component({
  selector: 'app-lightbulb-manage',
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    ConvertMiredPipe,
  ],
  standalone: true,
  templateUrl: './lightbulb.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LightbulbManageComponent extends BaseManageComponent {
  private $colour = inject(ColourService)

  // Inject lightbulb-specific data (optional)
  public isAdaptiveLightingEnabled$ = inject(LIGHTBULB_ADAPTIVE_LIGHTING)

  public targetMode: boolean
  public targetBrightness: SliderControlConfig
  public targetBrightnessChanged: Subject<number> = new Subject<number>()
  public targetHue: SimpleValueControlConfig
  public targetHueChanged: Subject<number> = new Subject<number>()
  public targetSaturation: SimpleValueControlConfig
  public targetSaturationChanged: Subject<number> = new Subject<number>()
  public targetColorTemperature: ColorTemperatureControlConfig
  public targetColorTemperatureChanged: Subject<number> = new Subject<number>()
  public hasAdaptiveLighting: boolean = false
  public isAdaptiveLightingEnabled: boolean = false

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetBrightnessChanged, () => {
      void this.service.getCharacteristic('Brightness').setValue(this.targetBrightness.value)

      // Turn the bulb on or off when brightness is adjusted
      if (this.targetBrightness.value && !this.service.values.On) {
        this.targetMode = true
        void this.service.getCharacteristic('On').setValue(this.targetMode)
      } else if (!this.targetBrightness.value && this.service.values.On) {
        this.targetMode = false
        void this.service.getCharacteristic('On').setValue(this.targetMode)
      }
    })

    this.createDebouncedSubscription(this.targetHueChanged, () => {
      void this.service.getCharacteristic('Hue').setValue(this.targetHue.value)
    })

    this.createDebouncedSubscription(this.targetSaturationChanged, () => {
      void this.service.getCharacteristic('Saturation').setValue(this.targetSaturation.value)
    })

    this.createDebouncedSubscription(this.targetColorTemperatureChanged, (miredValue) => {
      void this.service.getCharacteristic('ColorTemperature').setValue(miredValue)
    })

    this.targetMode = this.service.values.On
    this.loadTargetBrightness()
    this.loadTargetHue()
    this.loadTargetSaturation()
    this.loadTargetColorTemperature()
  }

  protected handleAccessoryUpdate() {
    this.targetMode = this.service.values.On
    if (this.targetBrightness) {
      this.targetBrightness.value = this.service.getCharacteristic('Brightness')?.value as number
    }
    if (this.targetHue) {
      this.targetHue.value = this.service.getCharacteristic('Hue')?.value as number
    }
    if (this.targetSaturation) {
      this.targetSaturation.value = this.service.getCharacteristic('Saturation')?.value as number
    }
    if (this.targetColorTemperature) {
      const colorTempValue = this.service.getCharacteristic('ColorTemperature')?.value as number
      this.targetColorTemperature.value = this.$colour.miredToKelvin(colorTempValue)
      this.targetColorTemperature.mired = colorTempValue
    }
  }

  public setTargetMode(value: boolean, event: MouseEvent) {
    this.targetMode = value
    void this.service.getCharacteristic('On').setValue(this.targetMode)

    // Set the brightness to max if on 0% when turned on
    if (this.targetMode && this.targetBrightness && !this.targetBrightness.value) {
      this.targetBrightness.value = this.service.getCharacteristic('Brightness').maxValue
    }

    this.blurTarget(event)
  }

  public onBrightnessStateChange() {
    this.targetBrightnessChanged.next(this.targetBrightness.value)
  }

  public onHueStateChange() {
    this.targetHueChanged.next(this.targetHue.value)
    this.applySaturationGradient()
  }

  public onSaturationStateChange() {
    this.targetSaturationChanged.next(this.targetSaturation.value)
  }

  public onColorTemperatureStateChange() {
    const miredValue = this.$colour.kelvinToMired(this.targetColorTemperature.value)
    this.targetColorTemperature.mired = miredValue
    this.targetColorTemperatureChanged.next(miredValue)
  }

  private loadTargetBrightness() {
    const TargetBrightness = this.service.getCharacteristic('Brightness')
    if (TargetBrightness) {
      this.targetBrightness = {
        value: TargetBrightness.value as number,
        min: TargetBrightness.minValue,
        max: TargetBrightness.maxValue,
        step: TargetBrightness.minStep,
      }
      this.applySliderGradient('linear-gradient(to right, #242424, #ffd6aa)', '.brightness-slider .noUi-target')
    }
  }

  private loadTargetHue() {
    const Hue = this.service.getCharacteristic('Hue')
    if (Hue) {
      this.targetHue = {
        value: Hue.value as number,
      }

      this.applySliderGradient(`linear-gradient(to right,
        hsl(0, 100%, 50%),
        hsl(60, 100%, 50%),
        hsl(120, 100%, 50%),
        hsl(180, 100%, 50%),
        hsl(240, 100%, 50%),
        hsl(300, 100%, 50%),
        hsl(360, 100%, 50%))`, '.hue-slider .noUi-target')
    }
  }

  private loadTargetSaturation() {
    const Saturation = this.service.getCharacteristic('Saturation')
    if (Saturation) {
      this.targetSaturation = {
        value: Saturation.value as number,
      }

      this.applySaturationGradient()
    }
  }

  private loadTargetColorTemperature() {
    const TargetColorTemperature = this.service.getCharacteristic('ColorTemperature')
    if (TargetColorTemperature) {
      // Here, the min and max are switched because mired and kelvin are inversely related
      this.targetColorTemperature = {
        value: this.$colour.miredToKelvin(TargetColorTemperature.value as number),
        mired: TargetColorTemperature.value as number,
        min: this.$colour.miredToKelvin(TargetColorTemperature.maxValue),
        max: this.$colour.miredToKelvin(TargetColorTemperature.minValue),
        step: TargetColorTemperature.minStep,
      }

      const minHsl = this.$colour.kelvinToHsl(this.targetColorTemperature.min)
      const maxHsl = this.$colour.kelvinToHsl(this.targetColorTemperature.max)
      this.applySliderGradient(`linear-gradient(to right, ${minHsl}, ${maxHsl})`, '.color-temp-slider .noUi-target')

      if (this.isAdaptiveLightingEnabled$) {
        this.hasAdaptiveLighting = true
        this.isAdaptiveLightingEnabled$
          .subscribe((value) => {
            this.isAdaptiveLightingEnabled = value
          })
      }
    }
  }

  private applySaturationGradient() {
    const hue = this.targetHue?.value || 0
    this.applySliderGradient(`linear-gradient(to right,
      hsl(${hue}, 0%, 50%),
      hsl(${hue}, 100%, 50%))`, '.saturation-slider .noUi-target')
  }
}
