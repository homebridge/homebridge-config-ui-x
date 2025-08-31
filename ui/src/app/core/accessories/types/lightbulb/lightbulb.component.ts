import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { BehaviorSubject } from 'rxjs'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LightbulbManageComponent } from '@/app/core/accessories/types/lightbulb/lightbulb.manage.component'
import { ColourService } from '@/app/core/colour.service'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-lightbulb',
  templateUrl: './lightbulb.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class LightbulbComponent {
  private $modal = inject(NgbModal)
  private intervalId: any

  public $colour = inject(ColourService)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public hasAdaptiveLighting: boolean = false
  public isAdaptiveLightingEnabled: boolean = false
  public isAdaptiveLightingEnabled$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false)

  public ngOnInit() {
    this.loadAdaptiveLighting()
  }

  public ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
  }

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    if ('On' in this.service.values) {
      this.service.getCharacteristic('On').setValue(!this.service.values.On)
    } else if ('Active' in this.service.values) {
      this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
    }

    // Set the brightness to max if on 0% when turned on
    if ('Brightness' in this.service.values && !this.service.values.On && !this.service.values.Brightness) {
      this.service.values.Brightness = this.service.getCharacteristic('Brightness').maxValue
    }
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    if ('Brightness' in this.service.values || 'Hue' in this.service.values || 'Saturation' in this.service.values || 'ColorTemperature' in this.service.values) {
      const ref = this.$modal.open(LightbulbManageComponent, {
        size: 'md',
        backdrop: 'static',
      })
      ref.componentInstance.service = this.service

      if (this.hasAdaptiveLighting) {
        ref.componentInstance.isAdaptiveLightingEnabled$ = this.isAdaptiveLightingEnabled$

        // User has opened the modal, so we now want to run the interval every 3 seconds
        if (this.intervalId) {
          clearInterval(this.intervalId)
        }
        this.intervalId = setInterval(() => {
          this.isAdaptiveLightingEnabled$.next(!!this.service.values.CharacteristicValueActiveTransitionCount)
        }, 3000)
        const subscription = this.isAdaptiveLightingEnabled$.subscribe((value) => {
          this.isAdaptiveLightingEnabled = value
        })

        // Clear the interval and subscription when the modal is closed and reset to the original interval
        ref.result.finally(() => {
          if (this.intervalId) {
            clearInterval(this.intervalId)
          }
          subscription.unsubscribe()
          this.intervalId = setInterval(() => {
            this.isAdaptiveLightingEnabled$.next(!!this.service.values.CharacteristicValueActiveTransitionCount)
          }, 30000)
        })
      }
    }
  }

  public kelvinToHex(kelvin: number): string {
    // Clamp kelvin to the valid range
    kelvin = Math.max(1000, Math.min(40000, kelvin))
    const temp = kelvin / 100
    let red, green, blue

    if (temp <= 66) {
      red = 255
      green = temp
      green = 99.4708025861 * Math.log(green) - 161.1195681661
      blue = temp <= 19 ? 0 : (138.5177312231 * Math.log(temp - 10) - 305.0447927307)
    } else {
      red = 329.698727446 * (temp - 60) ** -0.1332047592
      green = 288.1221695283 * (temp - 60) ** -0.0755148492
      blue = 255
    }

    red = Math.round(Math.min(Math.max(red, 0), 255))
    green = Math.round(Math.min(Math.max(green, 0), 255))
    blue = Math.round(Math.min(Math.max(blue, 0), 255))

    return (
      `#${
        red.toString(16).padStart(2, '0')
      }${green.toString(16).padStart(2, '0')
      }${blue.toString(16).padStart(2, '0')}`
    )
  }

  private loadAdaptiveLighting() {
    if ('CharacteristicValueActiveTransitionCount' in this.service.values) {
      this.hasAdaptiveLighting = true
      this.isAdaptiveLightingEnabled$.next(!!this.service.values.CharacteristicValueActiveTransitionCount)
      this.intervalId = setInterval(() => {
        this.isAdaptiveLightingEnabled$.next(!!this.service.values.CharacteristicValueActiveTransitionCount)
      }, 30000)
      this.isAdaptiveLightingEnabled$.subscribe((value) => {
        this.isAdaptiveLightingEnabled = value
      })
    }
  }

  protected readonly Math = Math
}
