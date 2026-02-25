import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { RvcOperationalState, RvcRunMode } from '@/app/core/accessories/types/matter/matter-device.constants'
import {
  getAreaProgress,
  getCleanModes,
  getCurrentArea,
  getCurrentCleanMode,
  getSelectedAreas,
  getServiceAreas,
  hasCleanModeCluster,
  hasServiceAreaCluster,
} from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-robotic-vacuum-cleaner-manage',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './robotic-vacuum-cleaner.manage.component.html',
  styleUrl: './robotic-vacuum-cleaner.manage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoboticVacuumCleanerManageComponent extends BaseManageComponent {
  private $toastr = inject(ToastrService)

  public currentMode: number = 0

  // Clean mode
  public hasCleanMode = false
  public cleanModes: Array<{ label: string, mode: number }> = []
  public currentCleanModeId: number = 0

  // Service area
  public hasServiceArea = false
  public areas: Array<{ areaId: number, name: string }> = []
  public selectedAreaIds: number[] = []
  public currentAreaId: number | null = null
  public areaProgress: Array<{ areaId: number, status: number }> = []

  protected setupComponent() {
    this.updateModeFromService()
    this.updateCleanModeFromService()
    this.updateServiceAreaFromService()
  }

  protected handleAccessoryUpdate() {
    this.updateModeFromService()
    this.updateCleanModeFromService()
    this.updateServiceAreaFromService()
  }

  private updateModeFromService() {
    // Get current operational state from rvcOperationalState cluster
    const operationalState = (this.service.clusters?.rvcOperationalState?.operationalState as number) ?? RvcOperationalState.Stopped

    // Map operational state to UI mode:
    // Running → Cleaning, Paused → Paused, all others → Stopped
    if (operationalState === RvcOperationalState.Running) {
      this.currentMode = RvcRunMode.Cleaning
    } else if (operationalState === RvcOperationalState.Paused) {
      this.currentMode = 2 // Paused (no RvcRunMode equivalent)
    } else {
      this.currentMode = RvcRunMode.Idle
    }
  }

  private updateCleanModeFromService() {
    this.hasCleanMode = hasCleanModeCluster(this.service)
    if (this.hasCleanMode) {
      this.cleanModes = getCleanModes(this.service)
      this.currentCleanModeId = getCurrentCleanMode(this.service)
    }
  }

  private updateServiceAreaFromService() {
    this.hasServiceArea = hasServiceAreaCluster(this.service)
    if (this.hasServiceArea) {
      this.areas = getServiceAreas(this.service)
      this.selectedAreaIds = getSelectedAreas(this.service)
      this.currentAreaId = getCurrentArea(this.service)
      this.areaProgress = getAreaProgress(this.service)
    }
  }

  public async setMode(mode: number, event: MouseEvent) {
    // Prevent pausing when stopped
    if (mode === RvcOperationalState.Paused && this.currentMode === RvcRunMode.Idle) {
      return
    }

    const previousMode = this.currentMode

    try {
      this.currentMode = mode
      this.cdr.markForCheck()

      if (mode === RvcRunMode.Idle) {
        // Stop → Set run mode to Idle
        const runModeCluster = this.service.getCluster?.('rvcRunMode')
        if (!runModeCluster) {
          throw new Error('RvcRunMode cluster not found')
        }
        await runModeCluster.setAttributes({ currentMode: RvcRunMode.Idle })
      } else if (mode === RvcRunMode.Cleaning) {
        // Cleaning → Set run mode to Cleaning
        const runModeCluster = this.service.getCluster?.('rvcRunMode')
        if (!runModeCluster) {
          throw new Error('RvcRunMode cluster not found')
        }
        await runModeCluster.setAttributes({ currentMode: RvcRunMode.Cleaning })
      } else if (mode === RvcOperationalState.Paused) {
        // Pause → Use operational state
        const cluster = this.service.getCluster?.('rvcOperationalState')
        if (!cluster) {
          throw new Error('RvcOperationalState cluster not found')
        }
        await cluster.setAttributes({ operationalState: RvcOperationalState.Paused })
      }

      this.blurTarget(event)
    } catch (error) {
      const modeText = mode === RvcRunMode.Idle ? 'stop' : mode === RvcRunMode.Cleaning ? 'start' : 'pause'
      this.$toastr.error(`Failed to ${modeText} robotic vacuum`, 'Error')
      // Revert to previous state on error
      this.currentMode = previousMode
      this.cdr.markForCheck()
    }
  }

  public async setCleanMode(mode: number, event: MouseEvent) {
    const previousMode = this.currentCleanModeId

    try {
      this.currentCleanModeId = mode
      this.cdr.markForCheck()

      const cluster = this.service.getCluster?.('rvcCleanMode')
      if (!cluster) {
        throw new Error('RvcCleanMode cluster not found')
      }
      await cluster.setAttributes({ currentMode: mode })
      this.blurTarget(event)
    } catch (error) {
      this.$toastr.error('Failed to set clean mode', 'Error')
      this.currentCleanModeId = previousMode
      this.cdr.markForCheck()
    }
  }

  public async toggleAreaSelection(areaId: number) {
    const previousSelection = [...this.selectedAreaIds]

    try {
      const index = this.selectedAreaIds.indexOf(areaId)
      if (index === -1) {
        this.selectedAreaIds = [...this.selectedAreaIds, areaId]
      } else {
        this.selectedAreaIds = this.selectedAreaIds.filter(id => id !== areaId)
      }
      this.cdr.markForCheck()

      const cluster = this.service.getCluster?.('serviceArea')
      if (!cluster) {
        throw new Error('ServiceArea cluster not found')
      }
      await cluster.setAttributes({ selectedAreas: this.selectedAreaIds })
    } catch (error) {
      this.$toastr.error('Failed to update area selection', 'Error')
      this.selectedAreaIds = previousSelection
      this.cdr.markForCheck()
    }
  }

  public isAreaSelected(areaId: number): boolean {
    return this.selectedAreaIds.includes(areaId)
  }

  public get isPauseDisabled(): boolean {
    // Can only pause if currently cleaning, not when stopped/idle
    return this.currentMode === RvcRunMode.Idle
  }
}
