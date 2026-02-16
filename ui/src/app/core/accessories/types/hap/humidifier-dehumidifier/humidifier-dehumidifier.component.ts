import { Component, createEnvironmentInjector, EnvironmentInjector, inject, input, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { HumidifierDehumidifierManageComponent } from '@/app/core/accessories/types/hap/humidifier-dehumidifier/humidifier-dehumidifier.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-humidifier-dehumidifier',
  templateUrl: './humidifier-dehumidifier.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
})
export class HumidifierDehumidifierComponent implements OnInit {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public service = input.required<ServiceTypeX>()
  public readyForControl = input<boolean>(false)
  public type = input<'humidifier' | 'dehumidifier'>()

  public hasHumidifier: boolean = false
  public hasDehumidifier: boolean = false

  public ngOnInit() {
    this.hasHumidifier = 'RelativeHumidityHumidifierThreshold' in this.service().values
    this.hasDehumidifier = 'RelativeHumidityDehumidifierThreshold' in this.service().values
  }

  public getStatusFill(): string {
    const values = this.service().values
    const isActive = values?.Active || values?.On
    const isHumidifying = (values?.CurrentHumidifierDehumidifierState === 2 && values?.Active === 1)
      || (this.type() === 'humidifier' && isActive)
    const isDehumidifying = (values?.CurrentHumidifierDehumidifierState === 3 && values?.Active === 1)
      || (this.type() === 'dehumidifier' && isActive)

    if (isHumidifying) {
      return 'url(#humidifyingGradient)'
    }

    if (isDehumidifying) {
      return 'url(#dehumidifyingGradient)'
    }

    return isActive ? '#42d672' : '#7b7b7b'
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

    if ('TargetHumidifierDehumidifierState' in this.service().values) {
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

      this.$modal.open(HumidifierDehumidifierManageComponent, {
        size: 'md',
        backdrop: 'static',
        injector: modalInjector,
      })
    }
  }
}
