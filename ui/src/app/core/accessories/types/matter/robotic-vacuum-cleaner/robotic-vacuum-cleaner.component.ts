import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { RoboticVacuumCleanerManageComponent } from '@/app/core/accessories/types/matter/robotic-vacuum-cleaner/robotic-vacuum-cleaner.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-robotic-vacuum-cleaner',
  templateUrl: './robotic-vacuum-cleaner.component.html',
  styleUrls: ['./robotic-vacuum-cleaner.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class RoboticVacuumCleanerComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      console.warn('Robotic vacuum: Not ready for control')
      return
    }

    // Get current operational state from rvcOperationalState cluster
    const currentState = (this.service.clusters?.rvcOperationalState?.operationalState as number) ?? 0

    // Determine action based on current state.
    // State 1 = Running → Pause
    // State 2 = Paused → Resume
    // All other states (0=Stopped, 64=SeekingCharger, 65=Charging, 66=Docked) → Start cleaning

    if (currentState === 1) {
      // Running → Pause
      const cluster = this.service.getCluster?.('rvcOperationalState')
      if (cluster) {
        cluster.setAttributes({ operationalState: 2 }).catch((error) => {
          console.error('Failed to pause Matter robotic vacuum:', error)
        })
      }
    } else if (currentState === 2) {
      // Paused → Resume
      const cluster = this.service.getCluster?.('rvcOperationalState')
      if (cluster) {
        cluster.setAttributes({ operationalState: 1 }).catch((error) => {
          console.error('Failed to resume Matter robotic vacuum:', error)
        })
      }
    } else {
      // Stopped/Docked/Charging → Start cleaning via RvcRunMode
      const runModeCluster = this.service.getCluster?.('rvcRunMode')
      if (runModeCluster) {
        runModeCluster.setAttributes({ currentMode: 1 }).catch((error) => {
          console.error('Failed to start Matter robotic vacuum:', error)
        })
      } else {
        console.error('RvcRunMode cluster not found')
      }
    }
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    const ref = this.$modal.open(RoboticVacuumCleanerManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
  }

  public get isActive(): boolean {
    // Active if in Running (1) or Paused (2) state
    const state = (this.service.clusters?.rvcOperationalState?.operationalState as number) ?? 0
    return state === 1 || state === 2
  }

  public get statusText(): string {
    const state = (this.service.clusters?.rvcOperationalState?.operationalState as number) ?? 0

    switch (state) {
      case 1:
        return 'accessories.control.cleaning'
      case 2:
        return 'accessories.control.paused'
      case 64:
        return 'Seeking Charger'
      case 65:
        return 'Charging'
      case 66:
        return 'Docked'
      case 0:
      default:
        return 'accessories.control.stopped'
    }
  }
}
