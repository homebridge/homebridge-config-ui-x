import { ChangeDetectionStrategy, Component, createEnvironmentInjector, EnvironmentInjector, inject, input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { DoorManageComponent } from '@/app/core/accessories/types/hap/door/door.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-door',
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './door.component.html',
  styleUrl: './door.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DoorComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    if (this.service().values.TargetPosition) {
      void this.service().getCharacteristic('TargetPosition').setValue(0)
    } else {
      void this.service().getCharacteristic('TargetPosition').setValue(100)
    }
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

    this.$modal.open(DoorManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }
}
