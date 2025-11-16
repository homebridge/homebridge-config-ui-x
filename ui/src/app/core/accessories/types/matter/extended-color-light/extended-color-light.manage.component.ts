import { NgClass } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject, Subscription } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { MatterBrightness, MatterColorTemperature } from '@/app/core/accessories/types/matter/matter-device.constants'
import { getBrightnessLevel, getColorTemperatureMireds, getHue, getOnOffState, getSaturation, hasColorTemperature, levelToPercentage } from '@/app/core/accessories/types/matter/matter-device.utils'
import { ColourService } from '@/app/core/colour.service'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'

@Component({
  templateUrl: './extended-color-light.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
    ConvertMiredPipe,
  ],
})
export class ExtendedColorLightManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)
  private $colour = inject(ColourService)

  @Input() public service: ServiceTypeX
  @Input() public $accessories: AccessoriesService

  public targetMode: boolean
  public targetBrightness: { value: number, min: number, max: number, step: number }
  public targetBrightnessChanged: Subject<number> = new Subject<number>()
  public targetColorTemperature: { value: number, mired: number, min: number, max: number, step: number }
  public targetColorTemperatureChanged: Subject<number> = new Subject<number>()
  public targetHue: { value: number, min: number, max: number, step: number }
  public targetHueChanged: Subject<number> = new Subject<number>()
  public targetSaturation: { value: number, min: number, max: number, step: number }
  public targetSaturationChanged: Subject<number> = new Subject<number>()
  public sliderIndex: number = 0
  private stateSubscription: Subscription

  constructor() {
    this.targetBrightnessChanged
      .pipe(debounceTime(300))
      .subscribe(() => {
        if (this.targetBrightness.value === MatterBrightness.Min) {
          // Turning off - use onOff cluster
          const cluster = this.service.getCluster?.('onOff')
          if (cluster) {
            cluster.setAttributes({ onOff: false }).catch((error) => {
              console.error('Failed to turn Matter light off:', error)
            })
          }
        } else {
          // Setting brightness - use levelControl cluster
          const cluster = this.service.getCluster?.('levelControl')
          if (cluster) {
            cluster.setAttributes({ currentLevel: this.targetBrightness.value }).catch((error) => {
              console.error('Failed to set Matter light brightness:', error)
            })
          }
        }

        // Update local state
        this.targetMode = this.targetBrightness.value > 0
      })

    this.targetColorTemperatureChanged
      .pipe(debounceTime(300))
      .subscribe((miredValue) => {
        const cluster = this.service.getCluster?.('colorControl')
        if (cluster) {
          cluster.setAttributes({ colorTemperatureMireds: miredValue }).catch((error) => {
            console.error('Failed to set Matter light color temperature:', error)
          })
        }
      })

    this.targetHueChanged
      .pipe(debounceTime(300))
      .subscribe(() => {
        const cluster = this.service.getCluster?.('colorControl')
        if (cluster) {
          cluster.setAttributes({
            currentHue: this.targetHue.value,
            currentSaturation: this.targetSaturation.value,
          }).catch((error) => {
            console.error('Failed to set Matter light hue:', error)
          })
        }
      })

    this.targetSaturationChanged
      .pipe(debounceTime(300))
      .subscribe(() => {
        const cluster = this.service.getCluster?.('colorControl')
        if (cluster) {
          cluster.setAttributes({
            currentHue: this.targetHue.value,
            currentSaturation: this.targetSaturation.value,
          }).catch((error) => {
            console.error('Failed to set Matter light saturation:', error)
          })
        }
      })
  }

  public ngOnInit() {
    this.targetMode = getOnOffState(this.service)
    this.loadTargetBrightness()
    if (this.supportsColorTemperature) {
      this.loadTargetColorTemperature()
    }
    this.loadTargetHueSaturation()

    // Subscribe to state changes to update modal in real-time
    this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
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
    })
  }

  public ngOnDestroy() {
    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe()
    }
  }

  public setTargetMode(value: boolean, event: MouseEvent) {
    this.targetMode = value

    if (value) {
      // Turning on - set brightness to max if currently 0, otherwise keep current
      const targetLevel = this.targetBrightness.value || this.targetBrightness.max
      this.targetBrightness.value = targetLevel
      const cluster = this.service.getCluster?.('levelControl')
      if (cluster) {
        cluster.setAttributes({ currentLevel: targetLevel }).catch((error) => {
          console.error('Failed to turn Matter light on:', error)
        })
      }
    } else {
      // Turning off - use onOff cluster instead of levelControl
      const cluster = this.service.getCluster?.('onOff')
      if (cluster) {
        cluster.setAttributes({ onOff: false }).catch((error) => {
          console.error('Failed to turn Matter light off:', error)
        })
      }
    }

    const target = event.target as HTMLButtonElement
    target.blur()
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

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private loadTargetBrightness() {
    const currentLevel = getBrightnessLevel(this.service)

    this.targetBrightness = {
      value: currentLevel,
      min: MatterBrightness.Min,
      max: MatterBrightness.Max,
      step: 1,
    }

    setTimeout(() => {
      const sliderElement = document.querySelectorAll('.noUi-target')[this.sliderIndex] as HTMLElement
      if (sliderElement) {
        sliderElement.style.background = 'linear-gradient(to right, #242424, #ffd6aa)'
        this.sliderIndex += 1
      }
    }, 10)
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

    setTimeout(() => {
      const sliderElement = document.querySelectorAll('.noUi-target')[this.sliderIndex] as HTMLElement
      if (sliderElement) {
        const minHsl = this.$colour.kelvinToHsl(this.targetColorTemperature.min)
        const maxHsl = this.$colour.kelvinToHsl(this.targetColorTemperature.max)
        sliderElement.style.background = `linear-gradient(to right, ${minHsl}, ${maxHsl})`
        this.sliderIndex += 1
      }
    }, 10)
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
    setTimeout(() => {
      const hueSlider = document.querySelectorAll('.noUi-target')[this.sliderIndex] as HTMLElement
      if (hueSlider) {
        hueSlider.style.background = 'linear-gradient(to right, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))'
        this.sliderIndex += 1
      }
    }, 10)

    // Style the saturation slider from white to current hue
    setTimeout(() => {
      const satSlider = document.querySelectorAll('.noUi-target')[this.sliderIndex] as HTMLElement
      if (satSlider) {
        const hDegrees = (currentHue / 254) * 360
        satSlider.style.background = `linear-gradient(to right, hsl(${hDegrees}, 0%, 50%), hsl(${hDegrees}, 100%, 50%))`
        this.sliderIndex += 1
      }
    }, 10)
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

  public get previewColor(): string {
    const hDegrees = (this.targetHue.value / 254) * 360
    const sPercent = (this.targetSaturation.value / 254) * 100
    return `hsl(${hDegrees}, ${sPercent}%, 50%)`
  }

  public get supportsColorTemperature(): boolean {
    return hasColorTemperature(this.service)
  }

  /**
   * Update the saturation slider gradient to match the current hue
   */
  private updateSaturationSliderGradient() {
    // Calculate saturation slider index based on whether color temp is supported
    // Order: brightness, [colorTemp?], hue, saturation
    const saturationSliderIndex = this.supportsColorTemperature ? 3 : 2

    const satSlider = document.querySelectorAll('.noUi-target')[saturationSliderIndex] as HTMLElement
    if (satSlider) {
      const hDegrees = (this.targetHue.value / 254) * 360
      satSlider.style.background = `linear-gradient(to right, hsl(${hDegrees}, 0%, 50%), hsl(${hDegrees}, 100%, 50%))`
    }
  }
}
