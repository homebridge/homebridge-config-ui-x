import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'
import { BehaviorSubject } from 'rxjs'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LightBulbManageComponent } from '@/app/core/accessories/types/light-bulb/light-bulb.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-light-bulb',
  templateUrl: './light-bulb.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGDirective,
    TranslatePipe,
  ],
})
export class LightBulbComponent {
  private $modal = inject(NgbModal)
  private intervalId: any

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
      const ref = this.$modal.open(LightBulbManageComponent, {
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
}
