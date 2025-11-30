import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { getDoorLockState, setDoorLockState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  templateUrl: './door-lock.manage.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DoorLockManageComponent implements OnInit {
  protected destroyRef = inject(DestroyRef)
  protected $activeModal = inject(NgbActiveModal)
  protected cdr = inject(ChangeDetectorRef)
  private $toastr = inject(ToastrService)

  // Inject modal data using modern DI pattern
  private modalData = inject(ACCESSORY_MANAGE_MODAL_DATA)

  // Public properties for component use (accessed by templates)
  public service!: ServiceTypeX
  public $accessories!: AccessoriesService

  public targetMode: number

  public ngOnInit() {
    // Null safety check
    if (!this.modalData.service || !this.modalData.$accessories) {
      console.error('DoorLockManageComponent: service or $accessories not provided')
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
    this.targetMode = getDoorLockState(this.service)
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
    this.targetMode = getDoorLockState(this.service)
  }

  public async setTargetMode(value: number, event: MouseEvent) {
    const previousMode = this.targetMode

    try {
      this.targetMode = value
      this.cdr.markForCheck()

      const locked = value === 1
      await setDoorLockState(this.service, locked)

      this.blurTarget(event)
    } catch (error) {
      this.$toastr.error(`Failed to ${value === 1 ? 'lock' : 'unlock'} door`, 'Error')
      // Revert to previous state on error
      this.targetMode = previousMode
      this.cdr.markForCheck()
    }
  }

  protected blurTarget(event: MouseEvent) {
    const target = event.target as HTMLButtonElement
    target.blur()
  }
}
