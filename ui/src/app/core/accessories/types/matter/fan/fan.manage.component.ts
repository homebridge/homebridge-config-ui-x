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
import { getFanPercentSetting, isFanOn, setFanSpeed } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  templateUrl: './fan.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterFanManageComponent implements OnInit {
  protected destroyRef = inject(DestroyRef)
  protected $activeModal = inject(NgbActiveModal)
  protected cdr = inject(ChangeDetectorRef)
  private $toastr = inject(ToastrService)

  // Inject modal data using modern DI pattern
  private modalData = inject(ACCESSORY_MANAGE_MODAL_DATA)

  // Public properties for component use (accessed by templates)
  public service!: ServiceTypeX
  public $accessories!: AccessoriesService

  public targetMode: boolean
  public targetSpeed: {
    value: number
    min: number
    max: number
    step: number
  }

  public targetSpeedChanged: Subject<number> = new Subject<number>()

  public ngOnInit() {
    // Null safety check
    if (!this.modalData.service || !this.modalData.$accessories) {
      console.error('MatterFanManageComponent: service or $accessories not provided')
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
      this.targetSpeedChanged,
      async () => {
        const previousSpeed = getFanPercentSetting(this.service)
        try {
          await setFanSpeed(this.service, this.targetSpeed.value)
        } catch (error) {
          this.$toastr.error('Failed to set fan speed', 'Error')
          // Revert to previous value on error
          this.targetSpeed.value = previousSpeed
          this.targetMode = previousSpeed > 0
          this.cdr.markForCheck()
        }
      },
    )

    this.targetMode = isFanOn(this.service)
    this.loadSpeed()
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
    this.targetMode = isFanOn(this.service)
    if (this.targetSpeed) {
      this.targetSpeed.value = getFanPercentSetting(this.service)
    }
  }

  public async setTargetMode(value: boolean, event: MouseEvent) {
    const previousMode = this.targetMode
    const previousSpeed = this.targetSpeed.value

    try {
      this.targetMode = value

      if (value) {
        // Turn on - set to 100% if currently 0%
        const speed = this.targetSpeed.value || 100
        await setFanSpeed(this.service, speed)
        this.targetSpeed.value = speed
      } else {
        // Turn off
        await setFanSpeed(this.service, 0)
        this.targetSpeed.value = 0
      }

      this.blurTarget(event)
    } catch (error) {
      this.$toastr.error(`Failed to turn fan ${value ? 'on' : 'off'}`, 'Error')
      // Revert to previous state on error
      this.targetMode = previousMode
      this.targetSpeed.value = previousSpeed
      this.cdr.markForCheck()
    }
  }

  public onTargetSpeedChange() {
    this.targetSpeedChanged.next(this.targetSpeed.value)

    // Update targetMode based on speed
    this.targetMode = this.targetSpeed.value > 0
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

  private loadSpeed() {
    this.targetSpeed = {
      value: getFanPercentSetting(this.service),
      min: 0,
      max: 100,
      step: 1,
    }

    this.applySliderGradient('linear-gradient(to right, #add8e6, #416bdf)')
  }
}
