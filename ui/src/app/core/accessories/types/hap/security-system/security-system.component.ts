import { Component, createEnvironmentInjector, EnvironmentInjector, inject, input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { SecuritySystemManageComponent } from '@/app/core/accessories/types/hap/security-system/security-system.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-security-system',
  templateUrl: './security-system.component.html',
  styleUrls: ['./security-system.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
})
export class SecuritySystemComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public service = input.required<ServiceTypeX>()
  public readyForControl = input<boolean>(false)

  public onClick() {
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

    this.$modal.open(SecuritySystemManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }
}
