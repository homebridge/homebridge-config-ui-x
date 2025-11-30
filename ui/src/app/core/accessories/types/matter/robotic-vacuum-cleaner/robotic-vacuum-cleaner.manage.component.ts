import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'

@Component({
  templateUrl: './robotic-vacuum-cleaner.manage.component.html',
  styleUrls: ['./robotic-vacuum-cleaner.manage.component.scss'],
  standalone: true,
  imports: [
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoboticVacuumCleanerManageComponent implements OnInit {
  protected destroyRef = inject(DestroyRef)
  protected $activeModal = inject(NgbActiveModal)
  protected cdr = inject(ChangeDetectorRef)
  private $toastr = inject(ToastrService)

  // Inject modal data using modern DI pattern
  private modalData = inject(ACCESSORY_MANAGE_MODAL_DATA)

  // Public properties for component use (accessed by templates)
  public service!: ServiceTypeX
  public $accessories!: AccessoriesService

  public currentMode: number = 0

  public ngOnInit() {
    // Null safety check
    if (!this.modalData.service || !this.modalData.$accessories) {
      console.error('RoboticVacuumCleanerManageComponent: service or $accessories not provided')
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
    this.updateModeFromService()
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
    this.updateModeFromService()
  }

  private updateModeFromService() {
    // Get current operational state from rvcOperationalState cluster
    const operationalState = (this.service.clusters?.rvcOperationalState?.operationalState as number) ?? 0

    // Map operational state to UI mode:
    // State 1 (Running) → Mode 1 (Cleaning)
    // State 2 (Paused) → Mode 2 (Paused)
    // All other states (0=Stopped, 64=SeekingCharger, 65=Charging, 66=Docked) → Mode 0 (Stopped)
    if (operationalState === 1) {
      this.currentMode = 1 // Cleaning
    } else if (operationalState === 2) {
      this.currentMode = 2 // Paused
    } else {
      this.currentMode = 0 // Stopped (includes docked, charging, etc.)
    }
  }

  public async setMode(mode: number, event: MouseEvent) {
    // Prevent pausing when stopped
    if (mode === 2 && this.currentMode === 0) {
      return
    }

    const previousMode = this.currentMode

    try {
      this.currentMode = mode
      this.cdr.markForCheck()

      // Control based on desired mode:
      // Mode 0 = Stopped → Set runMode to Idle (0)
      // Mode 1 = Cleaning → Set runMode to Cleaning (1)
      // Mode 2 = Paused → Use pause command

      if (mode === 0) {
        // Stop → Set run mode to Idle
        const runModeCluster = this.service.getCluster?.('rvcRunMode')
        if (!runModeCluster) {
          throw new Error('RvcRunMode cluster not found')
        }
        await runModeCluster.setAttributes({ currentMode: 0 })
      } else if (mode === 1) {
        // Cleaning → Set run mode to Cleaning
        const runModeCluster = this.service.getCluster?.('rvcRunMode')
        if (!runModeCluster) {
          throw new Error('RvcRunMode cluster not found')
        }
        await runModeCluster.setAttributes({ currentMode: 1 })
      } else if (mode === 2) {
        // Pause → Use operational state
        const cluster = this.service.getCluster?.('rvcOperationalState')
        if (!cluster) {
          throw new Error('RvcOperationalState cluster not found')
        }
        await cluster.setAttributes({ operationalState: 2 })
      }

      this.blurTarget(event)
    } catch (error) {
      const modeText = mode === 0 ? 'stop' : mode === 1 ? 'start' : 'pause'
      this.$toastr.error(`Failed to ${modeText} robotic vacuum`, 'Error')
      // Revert to previous state on error
      this.currentMode = previousMode
      this.cdr.markForCheck()
    }
  }

  protected blurTarget(event: MouseEvent) {
    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public get isPauseDisabled(): boolean {
    // Can only pause if currently cleaning (mode 1)
    // Cannot pause if stopped (mode 0)
    return this.currentMode === 0
  }
}
