import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'
import { BehaviorSubject } from 'rxjs'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LightbulbManageComponent } from '@/app/core/accessories/types//lightbulb/lightbulb.manage.component'
import { LongClickDirective } from '@/app/core/directives/longclick.directive'

@Component({
  selector: 'app-lightbulb',
  templateUrl: './lightbulb.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class LightbulbComponent {
  private $modal = inject(NgbModal)
  private intervalId: any

  @Input() public service: ServiceTypeX

  public hasAdaptiveLighting: boolean = false
  public isAdaptiveLightingEnabled: boolean = false
  public isAdaptiveLightingEnabled$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false)

  constructor() {}

  ngOnInit() {
    this.loadAdaptiveLighting()
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
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

  onClick() {
    this.service.getCharacteristic('On').setValue(!this.service.values.On)

    // Set the brightness to 100% if on 0% when turned on
    if (!this.service.values.On && 'Brightness' in this.service.values && !this.service.values.Brightness) {
      this.service.getCharacteristic('Brightness').setValue(100)
    }
  }

  onLongClick() {
    if ('Brightness' in this.service.values || 'Hue' in this.service.values || 'ColorTemperature' in this.service.values) {
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
}
