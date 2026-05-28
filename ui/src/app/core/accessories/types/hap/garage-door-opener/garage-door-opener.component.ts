import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, createEnvironmentInjector, effect, EnvironmentInjector, inject, input, signal } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { GarageDoorOpenerManageComponent } from '@/app/core/accessories/types/hap/garage-door-opener/garage-door-opener.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-garage-door-opener',
  imports: [
    LongClickDirective,
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './garage-door-opener.component.html',
  styleUrl: './garage-door-opener.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GarageDoorOpenerComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public readonly fromStopped = signal(false)
  private lastDoorState: number | undefined = undefined
  private lastMovingDirection: number | undefined = undefined

  constructor() {
    effect(() => {
      const currentState = this.service().values?.CurrentDoorState
      if (currentState !== this.lastDoorState) {
        const wasStopped = this.lastDoorState === 4
        this.fromStopped.set(wasStopped && (currentState === 2 || currentState === 3))
        if (currentState === 2 || currentState === 3) {
          this.lastMovingDirection = currentState
        }
        this.lastDoorState = currentState
      }
    })
  }

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('TargetDoorState' in this.service().values) {
      const currentState = this.service().values.CurrentDoorState
      // If Current is Closed, click -> Target is Open
      // If Current is Opening, click -> Target is Close
      // If Current is Open, click -> Target is Closed
      // If Current is Closing, click -> Target is Open
      // If Current is Stopped, reverse the last moving direction
      if (currentState === 4) {
        // Was Closing -> Open, was Opening -> Close
        void this.service().getCharacteristic!('TargetDoorState').setValue!(this.lastMovingDirection === 3 ? 0 : 1)
      } else if (currentState === 1 || currentState === 3) {
        void this.service().getCharacteristic!('TargetDoorState').setValue!(0)
      } else {
        void this.service().getCharacteristic!('TargetDoorState').setValue!(1)
      }
    } else if ('On' in this.service().values) {
      void this.service().getCharacteristic!('On').setValue!(!this.service().values.On)
    } else if ('Active' in this.service().values) {
      void this.service().getCharacteristic!('Active').setValue!(!this.service().values.Active)
    }
  }

  public onLongClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('TargetDoorState' in this.service().values) {
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

      this.$modal.open(GarageDoorOpenerManageComponent, {
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

    return this.service().values.Consumption
  }
}
