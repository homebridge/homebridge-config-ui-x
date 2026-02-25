import { ChangeDetectionStrategy, Component, computed, createEnvironmentInjector, EnvironmentInjector, inject, input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { RvcOperationalState } from '@/app/core/accessories/types/matter/matter-device.constants'
import { controlDevice, getDeviceActiveState, getDeviceStatusText, getRvcOperationalState, isOnOffDevice } from '@/app/core/accessories/types/matter/matter-device.utils'
import { RoboticVacuumCleanerManageComponent } from '@/app/core/accessories/types/matter/robotic-vacuum-cleaner/robotic-vacuum-cleaner.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-robotic-vacuum-cleaner',
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './robotic-vacuum-cleaner.component.html',
  styleUrl: './robotic-vacuum-cleaner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoboticVacuumCleanerComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    controlDevice(this.service())
  }

  public onLongClick() {
    if (!this.readyForControl() || !this.canShowModal()) {
      return
    }

    const modalInjector = createEnvironmentInjector(
      [{
        provide: ACCESSORY_MANAGE_MODAL_DATA,
        useValue: {
          service: this.service(),
          $accessories: this.$accessories,
        },
      }],
      this.injector,
    )

    this.$modal.open(RoboticVacuumCleanerManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }

  public readonly isActive = computed(() => getDeviceActiveState(this.service()))

  public readonly isRunning = computed(() => getRvcOperationalState(this.service()) === RvcOperationalState.Running)

  public readonly isCharging = computed(() => getRvcOperationalState(this.service()) === RvcOperationalState.Charging)

  public readonly statusText = computed(() => getDeviceStatusText(this.service()))

  public readonly canShowModal = computed(() => !isOnOffDevice(this.service()))
}
