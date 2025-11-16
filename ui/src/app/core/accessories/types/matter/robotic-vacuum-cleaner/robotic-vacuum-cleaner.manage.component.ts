import { NgClass } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { Subscription } from 'rxjs'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'

@Component({
  templateUrl: './robotic-vacuum-cleaner.manage.component.html',
  styleUrls: ['./robotic-vacuum-cleaner.manage.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class RoboticVacuumCleanerManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  @Input() public $accessories: AccessoriesService

  public currentMode: number = 0
  private stateSubscription: Subscription

  public ngOnInit() {
    this.updateModeFromService()

    // Subscribe to state changes to update modal in real-time
    this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
      this.updateModeFromService()
    })
  }

  public ngOnDestroy() {
    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe()
    }
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

  public setMode(mode: number, event: MouseEvent) {
    // Prevent pausing when stopped
    if (mode === 2 && this.currentMode === 0) {
      return
    }

    this.currentMode = mode

    // Control based on desired mode:
    // Mode 0 = Stopped → Set runMode to Idle (0)
    // Mode 1 = Cleaning → Set runMode to Cleaning (1)
    // Mode 2 = Paused → Use pause command

    if (mode === 0) {
      // Stop → Set run mode to Idle
      const runModeCluster = this.service.getCluster?.('rvcRunMode')
      if (runModeCluster) {
        runModeCluster.setAttributes({ currentMode: 0 }).catch((error) => {
          console.error('Failed to stop robotic vacuum:', error)
        })
      }
    } else if (mode === 1) {
      // Cleaning → Set run mode to Cleaning
      const runModeCluster = this.service.getCluster?.('rvcRunMode')
      if (runModeCluster) {
        runModeCluster.setAttributes({ currentMode: 1 }).catch((error) => {
          console.error('Failed to start robotic vacuum:', error)
        })
      }
    } else if (mode === 2) {
      // Pause → Use operational state
      const cluster = this.service.getCluster?.('rvcOperationalState')
      if (cluster) {
        cluster.setAttributes({ operationalState: 2 }).catch((error) => {
          console.error('Failed to pause robotic vacuum:', error)
        })
      }
    }

    // Blur the button to remove focus
    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public get isPauseDisabled(): boolean {
    // Can only pause if currently cleaning (mode 1)
    // Cannot pause if stopped (mode 0)
    return this.currentMode === 0
  }
}
