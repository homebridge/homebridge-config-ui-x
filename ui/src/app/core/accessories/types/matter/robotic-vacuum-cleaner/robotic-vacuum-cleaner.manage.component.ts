import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  templateUrl: './robotic-vacuum-cleaner.manage.component.html',
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class RoboticVacuumCleanerManageComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX

  public currentMode: number = 0

  public ngOnInit() {
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
}
