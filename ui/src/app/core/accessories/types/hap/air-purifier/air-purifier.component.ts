import { Component, createEnvironmentInjector, EnvironmentInjector, inject, input, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { AirPurifierManageComponent } from '@/app/core/accessories/types/hap/air-purifier/air-purifier.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-air-purifier',
  templateUrl: './air-purifier.component.html',
  styleUrls: ['./air-purifier.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
})
export class AirPurifierComponent implements OnInit {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)
  private hasTargetValidValues = false

  public service = input.required<ServiceTypeX>()
  public readyForControl = input<boolean>(false)

  public ngOnInit() {
    if ('TargetAirPurifierState' in this.service().values) {
      this.hasTargetValidValues = this.service().getCharacteristic('TargetAirPurifierState').validValues.length > 0
    }
  }

  public isOn(): boolean {
    const values = this.service().values
    return !!(
      (values?.Active && !('CurrentAirPurifierState' in values))
      || (values?.Active && 'CurrentAirPurifierState' in values && values?.CurrentAirPurifierState !== 0)
      || values?.On
    )
  }

  public isPurifying(): boolean {
    const values = this.service().values
    return !!(
      (values?.Active && !('CurrentAirPurifierState' in values))
      || (values?.Active && 'CurrentAirPurifierState' in values && values?.CurrentAirPurifierState === 2)
      || values?.On
    )
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

    if (this.hasTargetValidValues || 'RotationSpeed' in this.service().values) {
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

      this.$modal.open(AirPurifierManageComponent, {
        size: 'md',
        backdrop: 'static',
        injector: modalInjector,
      })
    }
  }
}
