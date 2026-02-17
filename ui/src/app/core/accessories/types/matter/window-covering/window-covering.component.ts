import { ChangeDetectionStrategy, Component, computed, createEnvironmentInjector, EnvironmentInjector, inject, input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { getWindowCoveringPercentage, toggleWindowCovering } from '@/app/core/accessories/types/matter/matter-device.utils'
import { WindowCoveringManageComponent } from '@/app/core/accessories/types/matter/window-covering/window-covering.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-matter-window-covering',
  templateUrl: './window-covering.component.html',
  styleUrl: './window-covering.component.scss',
  standalone: true,
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
})
export class MatterWindowCoveringComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    void toggleWindowCovering(this.service())
  }

  public onLongClick() {
    if (!this.readyForControl()) {
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

    this.$modal.open(WindowCoveringManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }

  public readonly currentPosition = computed(() => getWindowCoveringPercentage(this.service()))

  public readonly deviceType = computed(() => this.service().customType || this.service().deviceType || 'WindowCovering')

  public readonly isWindowCovering = computed(() => this.deviceType() === 'WindowCovering')

  public readonly isDoor = computed(() => this.deviceType() === 'Door')

  public readonly isWindow = computed(() => this.deviceType() === 'Window')
}
