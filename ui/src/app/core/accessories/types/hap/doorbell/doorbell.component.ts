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
import { DoorbellManageComponent } from '@/app/core/accessories/types/hap/doorbell/doorbell.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-doorbell',
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './doorbell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DoorbellComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public isOn(): boolean {
    const values = this.service().values
    if ('Active' in values) {
      return !!values?.Active
    }
    if ('CurrentMediaState' in values) {
      return [0, 1].includes(values?.CurrentMediaState)
    }
    if ('Mute' in values && 'Volume' in values) {
      return !values?.Mute && values?.Volume > 0
    }
    return 'Mute' in values && !values?.Mute
  }

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('Active' in this.service().values) {
      void this.service().getCharacteristic!('Active').setValue!(this.service().values.Active === 0 ? 1 : 0)
    } else if ('TargetMediaState' in this.service().values) {
      void this.service().getCharacteristic!('TargetMediaState').setValue!(this.service().values.TargetMediaState === 0 ? 1 : 0)
    } else if ('Mute' in this.service().values) {
      void this.service().getCharacteristic!('Mute').setValue!(!this.service().values.Mute)
    }
  }

  public onLongClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('Active' in this.service().values || 'TargetMediaState' in this.service().values || 'Volume' in this.service().values || 'Mute' in this.service().values) {
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

      this.$modal.open(DoorbellManageComponent, {
        size: 'md',
        backdrop: 'static',
        injector: modalInjector,
      })
    }
  }
}
