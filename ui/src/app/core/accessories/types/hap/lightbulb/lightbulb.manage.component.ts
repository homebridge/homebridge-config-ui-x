import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { BehaviorSubject, Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ColourService } from '@/app/core/colour.service'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'

@Component({
  templateUrl: './lightbulb.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
    ConvertMiredPipe,
  ],
})
export class LightbulbManageComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $colour = inject(ColourService)

  @Input() public service: ServiceTypeX
  @Input() public isAdaptiveLightingEnabled$: BehaviorSubject<boolean>

  public targetMode: any
  public targetBrightness: any
  public targetBrightnessChanged: Subject<number> = new Subject<number>()
  public targetHue: any
  public targetHueChanged: Subject<number> = new Subject<number>()
  public targetSaturation: any
  public targetSaturationChanged: Subject<number> = new Subject<number>()
  public targetColorTemperature: any
  public targetColorTemperatureChanged: Subject<number> = new Subject<number>()
  public hasAdaptiveLighting: boolean = false
  public isAdaptiveLightingEnabled: boolean = false
  public sliderIndex: number = 0

  constructor() {
    this.targetBrightnessChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        this.service.getCharacteristic('Brightness').setValue(this.targetBrightness.value)

        // Turn the bulb on or off when brightness is adjusted
        if (this.targetBrightness.value && !this.service.values.On) {
          this.targetMode = true
          this.service.getCharacteristic('On').setValue(this.targetMode)
        } else if (!this.targetBrightness.value && this.service.values.On) {
          this.targetMode = false
          this.service.getCharacteristic('On').setValue(this.targetMode)
        }
      })

    this.targetHueChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        this.service.getCharacteristic('Hue').setValue(this.targetHue.value)
      })

    this.targetSaturationChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        this.service.getCharacteristic('Saturation').setValue(this.targetSaturation.value)
      })

    this.targetColorTemperatureChanged
      .pipe(debounceTime(500))
      .subscribe((miredValue) => {
        this.service.getCharacteristic('ColorTemperature').setValue(miredValue)
      })
  }

  public ngOnInit() {
    this.targetMode = this.service.values.On
    this.loadTargetBrightness()
    this.loadTargetHue()
    this.loadTargetSaturation()
    this.loadTargetColorTemperature()
  }

  public setTargetMode(value: boolean, event: MouseEvent) {
    this.targetMode = value
    this.service.getCharacteristic('On').setValue(this.targetMode)

    // Set the brightness to max if on 0% when turned on
    if (this.targetMode && this.targetBrightness && !this.targetBrightness.value) {
      this.targetBrightness.value = this.service.getCharacteristic('Brightness').maxValue
    }

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public onBrightnessStateChange() {
    this.targetBrightnessChanged.next(this.targetBrightness.value)
  }

  public onHueStateChange() {
    this.targetHueChanged.next(this.targetHue.value)

    const sliderElement = document.querySelectorAll('.noUi-target')[this.sliderIndex - 1] as HTMLElement
    if (sliderElement) {
      const hue = this.targetHue.value
      sliderElement.style.background = `linear-gradient(to right,
        hsl(${hue}, 0%, 50%),
        hsl(${hue}, 100%, 50%))`
    }
  }

  public onSaturationStateChange() {
    this.targetSaturationChanged.next(this.targetSaturation.value)
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
    const TargetBrightness = this.service.getCharacteristic('Brightness')
    if (TargetBrightness) {
      this.targetBrightness = {
        value: TargetBrightness.value,
        min: TargetBrightness.minValue,
        max: TargetBrightness.maxValue,
        step: TargetBrightness.minStep,
      }
      setTimeout(() => {
        const sliderElement = document.querySelectorAll('.noUi-target')[this.sliderIndex] as HTMLElement
        if (sliderElement) {
          sliderElement.style.background = 'linear-gradient(to right, #242424, #ffd6aa)'
          this.sliderIndex += 1
        }
      }, 10)
    }
  }

  private loadTargetHue() {
    const Hue = this.service.getCharacteristic('Hue')
    if (Hue) {
      this.targetHue = {
        value: this.service.getCharacteristic('Hue').value as number,
      }

      setTimeout(() => {
        const sliderElement = document.querySelectorAll('.noUi-target')[this.sliderIndex] as HTMLElement
        if (sliderElement) {
          sliderElement.style.background = `linear-gradient(to right,
            hsl(0, 100%, 50%),
            hsl(60, 100%, 50%),
            hsl(120, 100%, 50%),
            hsl(180, 100%, 50%),
            hsl(240, 100%, 50%),
            hsl(300, 100%, 50%),
            hsl(360, 100%, 50%))`
        }
        this.sliderIndex += 1
      }, 10)
    }
  }

  private loadTargetSaturation() {
    const Saturation = this.service.getCharacteristic('Saturation')
    if (Saturation) {
      this.targetSaturation = {
        value: this.service.getCharacteristic('Saturation').value as number,
      }

      setTimeout(() => {
        const sliderElement = document.querySelectorAll('.noUi-target')[this.sliderIndex] as HTMLElement
        if (sliderElement) {
          const hue = this.targetHue.value || 0
          sliderElement.style.background = `linear-gradient(to right,
            hsl(${hue}, 0%, 50%),
            hsl(${hue}, 100%, 50%))`
        }
        this.sliderIndex += 1
      }, 10)
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

      setTimeout(() => {
        const sliderElement = document.querySelectorAll('.noUi-target')[this.sliderIndex] as HTMLElement
        if (sliderElement) {
          const minHsl = this.$colour.kelvinToHsl(this.targetColorTemperature.min)
          const maxHsl = this.$colour.kelvinToHsl(this.targetColorTemperature.max)
          sliderElement.style.background = `linear-gradient(to right, ${minHsl}, ${maxHsl})`
        }
      }, 10)

      if (this.isAdaptiveLightingEnabled$) {
        this.hasAdaptiveLighting = true
        this.isAdaptiveLightingEnabled$.subscribe((value) => {
          this.isAdaptiveLightingEnabled = value
        })
      }
    }
  }
}
