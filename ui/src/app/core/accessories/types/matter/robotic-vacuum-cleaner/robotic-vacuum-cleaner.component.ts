import { ChangeDetectionStrategy, Component, computed, createEnvironmentInjector, EnvironmentInjector, inject, input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { controlDevice, getDeviceActiveState, getDeviceStatusText, isOnOffDevice } from '@/app/core/accessories/types/matter/matter-device.utils'
import { RoboticVacuumCleanerManageComponent } from '@/app/core/accessories/types/matter/robotic-vacuum-cleaner/robotic-vacuum-cleaner.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-robotic-vacuum-cleaner',
  templateUrl: './robotic-vacuum-cleaner.component.html',
  styleUrl: './robotic-vacuum-cleaner.component.scss',
  standalone: true,
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
})
export class RoboticVacuumCleanerComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public onClick() {
    if (!this.readyForControl()) {
      console.warn('Robotic vacuum: Not ready for control')
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

  public readonly statusText = computed(() => getDeviceStatusText(this.service()))

  public readonly canShowModal = computed(() => !isOnOffDevice(this.service()))
}
