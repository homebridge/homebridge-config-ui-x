import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { MatterBrightness, MatterColorTemperature } from '@/app/core/accessories/types/matter/matter-device.constants'
import { getBrightnessLevel, getColorTemperatureMireds, getHue, getOnOffState, getSaturation, hasColorTemperature, levelToPercentage } from '@/app/core/accessories/types/matter/matter-device.utils'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'
import { ColourService } from '@/app/core/utilities/colour.service'

@Component({
  templateUrl: './extended-color-light.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    ConvertMiredPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtendedColorLightManageComponent implements OnInit {
  protected destroyRef = inject(DestroyRef)
  protected $activeModal = inject(NgbActiveModal)
  protected cdr = inject(ChangeDetectorRef)
  private $colour = inject(ColourService)
  private $toastr = inject(ToastrService)

  // Inject modal data using modern DI pattern
  private modalData = inject(ACCESSORY_MANAGE_MODAL_DATA)

  // Public properties for component use (accessed by templates)
  public service!: ServiceTypeX
  public $accessories!: AccessoriesService

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

  public ngOnInit() {
    // Null safety check
    if (!this.modalData.service || !this.modalData.$accessories) {
      console.error('ExtendedColorLightManageComponent: service or $accessories not provided')
      this.$activeModal.dismiss('Missing required data')
      return
    }

    // Store in public properties (same object references)
    this.service = this.modalData.service
    this.$accessories = this.modalData.$accessories

    this.setupComponent()
    this.subscribeToAccessoryUpdates()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private setupComponent() {
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
          this.$toastr.error('Failed to set light color temperature', 'Error')
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
          this.$toastr.error('Failed to set light hue', 'Error')
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
          this.$toastr.error('Failed to set light saturation', 'Error')
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

  private subscribeToAccessoryUpdates() {
    if (this.$accessories) {
      this.$accessories.accessoryData.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.handleAccessoryUpdate()
        this.cdr.markForCheck()
      })
    }
  }

  private handleAccessoryUpdate() {
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

  private createDebouncedSubscription<T>(
    subject$: Subject<T>,
    callback: (value: T) => void,
    debounceMs: number = 500,
  ) {
    subject$
      .pipe(debounceTime(debounceMs), takeUntilDestroyed(this.destroyRef))
      .subscribe(callback)
  }

  private applySliderGradient(gradient: string, selector: string = '.noUi-target') {
    requestAnimationFrame(() => {
      const sliderElements = document.querySelectorAll<HTMLElement>(selector)
      sliderElements.forEach((sliderElement) => {
        sliderElement.style.background = gradient
      })
    })
  }

  protected blurTarget(event: MouseEvent) {
    const target = event.target as HTMLButtonElement
    target.blur()
  }

  private loadTargetBrightness() {
    const currentLevel = getBrightnessLevel(this.service)

    this.targetBrightness = {
      value: currentLevel,
      min: MatterBrightness.Min,
      max: MatterBrightness.Max,
      step: 1,
    }

    this.applySliderGradient('linear-gradient(to right, #242424, #ffd6aa)', `.noUi-target:nth-of-type(${this.sliderIndex + 1})`)
    this.sliderIndex += 1
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
    this.applySliderGradient(`linear-gradient(to right, ${minHsl}, ${maxHsl})`, `.noUi-target:nth-of-type(${this.sliderIndex + 1})`)
    this.sliderIndex += 1
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
    this.applySliderGradient('linear-gradient(to right, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))', `.noUi-target:nth-of-type(${this.sliderIndex + 1})`)
    this.sliderIndex += 1

    // Style the saturation slider from white to current hue
    const hDegrees = (currentHue / 254) * 360
    this.applySliderGradient(`linear-gradient(to right, hsl(${hDegrees}, 0%, 50%), hsl(${hDegrees}, 100%, 50%))`, `.noUi-target:nth-of-type(${this.sliderIndex + 1})`)
    this.sliderIndex += 1
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
    return hasColorTemperature(this.service)
  }

  /**
   * Update the saturation slider gradient to match the current hue
   */
  private updateSaturationSliderGradient() {
    // Calculate saturation slider index based on whether color temp is supported
    // Order: brightness, [colorTemp?], hue, saturation
    const saturationSliderIndex = this.supportsColorTemperature ? 3 : 2

    const hDegrees = (this.targetHue.value / 254) * 360
    this.applySliderGradient(`linear-gradient(to right, hsl(${hDegrees}, 0%, 50%), hsl(${hDegrees}, 100%, 50%))`, `.noUi-target:nth-of-type(${saturationSliderIndex + 1})`)
  }
}
