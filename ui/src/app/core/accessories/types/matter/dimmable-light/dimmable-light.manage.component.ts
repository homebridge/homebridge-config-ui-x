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
import { MatterBrightness } from '@/app/core/accessories/types/matter/matter-device.constants'
import { getBrightnessLevel, getOnOffState, levelToPercentage } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  templateUrl: './dimmable-light.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
  ],
})
export class DimmableLightManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  @Input() public $accessories: AccessoriesService

  public targetMode: boolean
  public targetBrightness: { value: number, min: number, max: number, step: number }
  public targetBrightnessChanged: Subject<number> = new Subject<number>()
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
  }

  public ngOnInit() {
    this.targetMode = getOnOffState(this.service)
    this.loadTargetBrightness()

    // Subscribe to state changes to update modal in real-time
    this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
      this.targetMode = getOnOffState(this.service)
      this.targetBrightness.value = getBrightnessLevel(this.service)
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
      const sliderElement = document.querySelector('.noUi-target') as HTMLElement
      if (sliderElement) {
        sliderElement.style.background = 'linear-gradient(to right, #242424, #ffd6aa)'
      }
    }, 10)
  }

  public get brightnessPercentage(): number {
    return levelToPercentage(this.targetBrightness.value)
  }
}
