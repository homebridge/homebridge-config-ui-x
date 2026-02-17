import {
  ChangeDetectionStrategy,
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  input,
  OnInit,
} from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { TelevisionManageComponent } from '@/app/core/accessories/types/hap/television/television.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-television',
  templateUrl: './television.component.html',
  styleUrl: './television.component.scss',
  standalone: true,
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
})
export class TelevisionComponent implements OnInit {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public service = input.required<ServiceTypeX>()
  public readyForControl = input<boolean>(false)

  public channelList: Record<number, string> = {}

  public ngOnInit() {
    if (this.service().linkedServices) {
      for (const [, inputService] of Object.entries(this.service().linkedServices)) {
        if (inputService.type === 'InputSource') {
          this.channelList[inputService.values.Identifier] = inputService.values.ConfiguredName || `Input ${inputService.values.Identifier}`
        }
      }
    }
  }

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('Active' in this.service().values) {
      void this.service().getCharacteristic('Active').setValue(this.service().values.Active ? 0 : 1)
    } else if ('On' in this.service().values) {
      void this.service().getCharacteristic('On').setValue(!this.service().values.On)
    }
  }

  public onLongClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('Active' in this.service().values || Object.keys(this.channelList).length) {
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

      this.$modal.open(TelevisionManageComponent, {
        size: 'md',
        backdrop: 'static',
        injector: modalInjector,
      })
    }
  }
}
