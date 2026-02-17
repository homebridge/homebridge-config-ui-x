import {
  ChangeDetectionStrategy,
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  input,
} from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { LockMechanismManageComponent } from '@/app/core/accessories/types/hap/lock-mechanism/lock-mechanism.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-lock-mechanism',
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './lock-mechanism.component.html',
  styleUrl: './lock-mechanism.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LockMechanismComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public onClick() {
    if (!this.readyForControl()) {
      return
    }
    if ('LockTargetState' in this.service().values) {
      void this.service().getCharacteristic('LockTargetState').setValue(this.service().values.LockTargetState ? 0 : 1)
    } else if ('On' in this.service().values) {
      void this.service().getCharacteristic('On').setValue(!this.service().values.On)
    }
  }

  public onLongClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('LockTargetState' in this.service().values) {
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

      this.$modal.open(LockMechanismManageComponent, {
        size: 'md',
        backdrop: 'static',
        injector: modalInjector,
      })
    }
  }
}
