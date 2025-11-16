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
import { getBrightnessLevel, getColorTemperatureMireds, getOnOffState, levelToPercentage } from '@/app/core/accessories/types/matter/matter-device.utils'
import { ColourService } from '@/app/core/colour.service'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'

@Component({
  templateUrl: './color-temperature-light.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
    ConvertMiredPipe,
  ],
})
export class ColorTemperatureLightManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)
  private $colour = inject(ColourService)

  @Input() public service: ServiceTypeX
  @Input() public $accessories: AccessoriesService

  public targetMode: boolean
  public targetBrightness: { value: number, min: number, max: number, step: number }
  public targetBrightnessChanged: Subject<number> = new Subject<number>()
  public targetColorTemperature: { value: number, mired: number, min: number, max: number, step: number }
  public targetColorTemperatureChanged: Subject<number> = new Subject<number>()
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
  }

  public ngOnInit() {
    this.targetMode = getOnOffState(this.service)
    this.loadTargetBrightness()
    this.loadTargetColorTemperature()

    // Subscribe to state changes to update modal in real-time
    this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
      this.targetMode = getOnOffState(this.service)
      this.targetBrightness.value = getBrightnessLevel(this.service)

      const newMired = getColorTemperatureMireds(this.service)
      this.targetColorTemperature.mired = newMired
      this.targetColorTemperature.value = this.$colour.miredToKelvin(newMired)
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
      // Setting level to 0 may be clamped to minLevel, keeping light on
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
      }
    }, 10)
  }

  public get brightnessPercentage(): number {
    return levelToPercentage(this.targetBrightness.value)
  }
}
