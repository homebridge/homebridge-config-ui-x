import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-lightbulb-manage',
  templateUrl: './lightbulb.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
  ],
})
export class LightbulbManageComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  public targetMode: any

  public targetBrightness: any
  public targetBrightnessChanged: Subject<string> = new Subject<string>()

  public targetColorTemperature: any
  public targetColorTemperatureChanged: Subject<string> = new Subject<string>()

  constructor() {
    this.targetBrightnessChanged
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        this.service.getCharacteristic('Brightness').setValue(this.targetBrightness.value)

        // Turn bulb on or off when brightness is adjusted
        if (this.targetBrightness.value && !this.service.values.On) {
          this.targetMode = true
          this.service.getCharacteristic('On').setValue(this.targetMode)
        } else if (!this.targetBrightness.value && this.service.values.On) {
          this.targetMode = false
          this.service.getCharacteristic('On').setValue(this.targetMode)
        }
      })

    this.targetColorTemperatureChanged
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        this.service.getCharacteristic('ColorTemperature').setValue(this.kelvinToMired(this.targetColorTemperature.value))
      })
  }

  ngOnInit() {
    this.targetMode = this.service.values.On

    this.loadTargetBrightness()
    this.loadTargetColorTemperature()
  }

  loadTargetBrightness() {
    const TargetBrightness = this.service.getCharacteristic('Brightness')

    if (TargetBrightness) {
      this.targetBrightness = {
        value: TargetBrightness.value,
        min: TargetBrightness.minValue,
        max: TargetBrightness.maxValue,
        step: TargetBrightness.minStep,
      }
    }
  }

  loadTargetColorTemperature() {
    const TargetColorTemperature = this.service.getCharacteristic('ColorTemperature')

    if (TargetColorTemperature) {
      // Here, the min and max are switched because mired and kelvin are inversely related
      this.targetColorTemperature = {
        value: this.miredToKelvin(TargetColorTemperature.value as number),
        min: this.miredToKelvin(TargetColorTemperature.maxValue),
        max: this.miredToKelvin(TargetColorTemperature.minValue),
        step: TargetColorTemperature.minStep,
      }

      setTimeout(() => {
        const minRgb = this.kelvinToRgb(this.targetColorTemperature.min)
        const maxRgb = this.kelvinToRgb(this.targetColorTemperature.max)
        const sliderElement = document.querySelectorAll('.noUi-target')[1] as HTMLElement
        if (sliderElement) {
          sliderElement.style.background = `linear-gradient(to right, ${minRgb}, ${maxRgb})`
        }
      }, 10)
    }
  }

  setTargetMode(value: boolean) {
    this.targetMode = value
    this.service.getCharacteristic('On').setValue(this.targetMode)

    // Set the brightness to 100% if on 0% when turned on
    if (this.targetMode && this.targetBrightness && !this.targetBrightness.value) {
      this.targetBrightness.value = 100
    }
  }

  onBrightnessStateChange() {
    this.targetBrightnessChanged.next(this.targetBrightness.value)
  }

  onColorTemperatureStateChange() {
    this.targetColorTemperatureChanged.next(this.targetColorTemperature.value)
  }

  miredToKelvin(kelvin: number) {
    return Math.round(1000000 / kelvin)
  }

  kelvinToMired(kelvin: number) {
    return Math.round(1000000 / kelvin)
  }

  kelvinToRgb(kelvin: number): string {
    // Approximate conversion from Kelvin to RGB
    const temp = kelvin / 100
    let red: number
    let green: number
    let blue: number

    if (temp <= 66) {
      red = 255
      green = Math.min(99.4708025861 * Math.log(temp) - 161.1195681661, 255)
      blue = temp <= 19 ? 0 : Math.min(138.5177312231 * Math.log(temp - 10) - 305.0447927307, 255)
    } else {
      red = Math.min(329.698727446 * (temp - 60) ** -0.1332047592, 255)
      green = Math.min(288.1221695283 * (temp - 60) ** -0.0755148492, 255)
      blue = 255
    }

    return `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`
  }
}
