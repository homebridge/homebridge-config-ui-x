import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, InjectionToken, OnInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'

/**
 * Injection token for accessory manage modal data
 * Provides type-safe dependency injection for modal components
 */
export interface AccessoryManageModalData {
  service: ServiceTypeX
  $accessories: AccessoriesService
}

export const ACCESSORY_MANAGE_MODAL_DATA = new InjectionToken<AccessoryManageModalData>(
  'AccessoryManageModalData',
)

/**
 * Base class for accessory manage modal components
 * Extracts common functionality for modal management, real-time updates, and debounced inputs
 * Uses modern Angular DI pattern instead of @Input() for modal data
 */
@Component({
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export abstract class BaseManageComponent implements OnInit {
  protected destroyRef = inject(DestroyRef)
  protected $activeModal = inject(NgbActiveModal)
  protected cdr = inject(ChangeDetectorRef)

  // Inject modal data using modern DI pattern
  private modalData = inject(ACCESSORY_MANAGE_MODAL_DATA)

  // Public properties for component use (accessed by templates)
  public service!: ServiceTypeX
  public $accessories!: AccessoriesService

  public ngOnInit() {
    // Null safety check
    if (!this.modalData.service || !this.modalData.$accessories) {
      console.error('BaseManageComponent: service or $accessories not provided')
      this.$activeModal.dismiss('Missing required data')
      return
    }

    // Store in public properties (same object references)
    this.service = this.modalData.service
    this.$accessories = this.modalData.$accessories

    this.setupComponent()
    this.subscribeToAccessoryUpdates()
  }

  /**
   * Dismiss the modal
   */
  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  /**
   * Child classes should implement their initialization logic here
   */
  protected abstract setupComponent(): void

  /**
   * Child classes should implement how they handle real-time accessory updates
   */
  protected abstract handleAccessoryUpdate(): void

  /**
   * Subscribe to real-time accessory data updates
   */
  private subscribeToAccessoryUpdates() {
    if (this.$accessories) {
      this.$accessories.accessoryData.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.handleAccessoryUpdate()
        this.cdr.markForCheck()
      })
    }
  }

  /**
   * Helper to create a debounced subscription for value changes
   * @param subject$ The subject to subscribe to
   * @param callback The callback to execute after debounce
   * @param debounceMs Debounce time in milliseconds (default 500)
   */
  protected createDebouncedSubscription<T>(
    subject$: Subject<T>,
    callback: (value: T) => void,
    debounceMs: number = 500,
  ) {
    subject$
      .pipe(debounceTime(debounceMs), takeUntilDestroyed(this.destroyRef))
      .subscribe(callback)
  }

  /**
   * Apply gradient background to nouislider elements
   * Uses requestAnimationFrame instead of setTimeout for better performance
   * @param gradient The CSS gradient string
   * @param selector Optional selector for specific sliders (default: all .noUi-target)
   */
  protected applySliderGradient(gradient: string, selector: string = '.noUi-target') {
    requestAnimationFrame(() => {
      const sliderElements = document.querySelectorAll<HTMLElement>(selector)
      sliderElements.forEach((sliderElement) => {
        sliderElement.style.background = gradient
      })
    })
  }

  /**
   * Blur the event target button (common pattern after button clicks)
   */
  protected blurTarget(event: MouseEvent) {
    const target = event.target as HTMLButtonElement
    target.blur()
  }
}
