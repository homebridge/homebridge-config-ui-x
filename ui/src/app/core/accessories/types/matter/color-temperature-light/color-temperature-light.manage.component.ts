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
export class ColorTemperatureLightManageComponent implements OnInit {
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
  public sliderIndex: number = 0

  public ngOnInit() {
    // Null safety check
    if (!this.modalData.service || !this.modalData.$accessories) {
      console.error('ColorTemperatureLightManageComponent: service or $accessories not provided')
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

    this.targetMode = getOnOffState(this.service)
    this.loadTargetBrightness()
    this.loadTargetColorTemperature()
  }

  private subscribeToAccessoryUpdates() {
    if (this.$accessories) {
      this.$accessories.accessoryData.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        // Update service reference to get latest data (zoneless Angular compatibility)
        const updatedService = this.$accessories.accessories.services.find(s => s.uniqueId === this.service.uniqueId)
        if (updatedService) {
          this.service = updatedService
        }
        this.handleAccessoryUpdate()
        this.cdr.markForCheck()
      })
    }
  }

  private handleAccessoryUpdate() {
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
  }

  public get brightnessPercentage(): number {
    return levelToPercentage(this.targetBrightness.value)
  }
}
