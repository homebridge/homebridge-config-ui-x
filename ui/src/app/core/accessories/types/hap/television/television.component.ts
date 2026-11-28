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
import { numberValue, stringValue } from '@/app/core/accessories/types/hap/hap-values'
import { TelevisionManageComponent } from '@/app/core/accessories/types/hap/television/television.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-television',
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './television.component.html',
  styleUrl: './television.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TelevisionComponent implements OnInit {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public channelList: Record<number, string> = {}

  /** The name of the input that is showing, if the TV reports one */
  public activeChannelName(): string | undefined {
    const identifier = numberValue(this.service().values, 'ActiveIdentifier')
    return identifier === undefined
      ? undefined
      : this.channelList[identifier]
  }

  public ngOnInit() {
    if (this.service().linkedServices) {
      for (const [, inputService] of Object.entries(this.service().linkedServices!)) {
        const identifier = numberValue(inputService.values, 'Identifier')
        if (inputService.type === 'InputSource' && identifier !== undefined) {
          this.channelList[identifier] = stringValue(inputService.values, 'ConfiguredName') || `Input ${identifier}`
        }
      }
    }
  }

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('Active' in this.service().values) {
      void this.service().getCharacteristic?.('Active')?.setValue?.(this.service().values.Active
        ? 0
        : 1)
    } else if ('On' in this.service().values) {
      void this.service().getCharacteristic?.('On')?.setValue?.(!this.service().values.On)
    }
  }

  public onLongClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('Active' in this.service().values || Object.keys(this.channelList).length) {
      const modalInjector = createEnvironmentInjector(
        [
          {
            provide: ACCESSORY_MANAGE_MODAL_DATA,
            useValue: {
              service: this.service(),
              $accessories: this.$accessories,
            },
          },
        ],
        this.injector,
      )

      this.$modal.open(TelevisionManageComponent, {
        size: 'md',
        backdrop: 'static',
        injector: modalInjector,
      })
    }
  }

  public hasCurrentConsumption(): boolean {
    return 'Consumption' in this.service().values
  }

  public currentConsumption(): number | undefined {
    if (!this.hasCurrentConsumption()) {
      return undefined
    }

    return numberValue(this.service().values, 'Consumption')
  }
}
