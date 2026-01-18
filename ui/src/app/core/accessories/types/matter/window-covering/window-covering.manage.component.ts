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
import { getWindowCoveringPercentage, setWindowCoveringPosition } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  templateUrl: './window-covering.manage.component.html',
  standalone: true,
  imports: [
    NouisliderComponent,
    FormsModule,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WindowCoveringManageComponent implements OnInit {
  protected destroyRef = inject(DestroyRef)
  protected $activeModal = inject(NgbActiveModal)
  protected cdr = inject(ChangeDetectorRef)
  private $toastr = inject(ToastrService)

  // Inject modal data using modern DI pattern
  private modalData = inject(ACCESSORY_MANAGE_MODAL_DATA)

  // Public properties for component use (accessed by templates)
  public service!: ServiceTypeX
  public $accessories!: AccessoriesService

  public targetPositionChanged: Subject<number> = new Subject<number>()
  public targetPosition: {
    value: number
    min: number
    max: number
    step: number
  }

  public ngOnInit() {
    // Null safety check
    if (!this.modalData.service || !this.modalData.$accessories) {
      console.error('WindowCoveringManageComponent: service or $accessories not provided')
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
    this.loadTargetPosition()

    // Subscribe to target position changes with debounce
    this.createDebouncedSubscription(
      this.targetPositionChanged,
      async () => {
        const previousPosition = getWindowCoveringPercentage(this.service)
        try {
          await setWindowCoveringPosition(this.service, this.targetPosition.value)
        } catch (error) {
          this.$toastr.error('Failed to set window covering position', 'Error')
          // Revert to previous value on error
          this.targetPosition.value = previousPosition
          this.cdr.markForCheck()
        }
      },
    )
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
    if (this.targetPosition) {
      this.targetPosition.value = getWindowCoveringPercentage(this.service)
    }
  }

  public onTargetPositionChange() {
    this.targetPositionChanged.next(this.targetPosition.value)
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

  private loadTargetPosition() {
    this.targetPosition = {
      value: getWindowCoveringPercentage(this.service),
      min: 0,
      max: 100,
      step: 1,
    }

    this.applySliderGradient('linear-gradient(to right, #242424, #ffd6aa)')
  }

  public get currentPosition(): number {
    return getWindowCoveringPercentage(this.service)
  }
}
