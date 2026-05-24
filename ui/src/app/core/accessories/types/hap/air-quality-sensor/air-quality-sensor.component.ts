import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, createEnvironmentInjector, EnvironmentInjector, inject, input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { HapAirQualitySensorManageComponent } from '@/app/core/accessories/types/hap/air-quality-sensor/air-quality-sensor.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-air-quality-sensor',
  imports: [LowerCasePipe, TranslatePipe, LongClickDirective],
  standalone: true,
  templateUrl: './air-quality-sensor.component.html',
  styleUrl: './air-quality-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AirQualitySensorComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()

  public labels = ['Unknown', 'Excellent', 'Good', 'Fair', 'Inferior', 'Poor']

  public readonly canShowModal = computed(() => {
    const values = this.service().values
    return values?.PM2_5Density !== undefined
      || values?.PM10Density !== undefined
      || values?.OzoneDensity !== undefined
      || values?.NitrogenDioxideDensity !== undefined
      || values?.SulphurDioxideDensity !== undefined
      || values?.VOCDensity !== undefined
  })

  public onLongClick() {
    if (!this.canShowModal()) {
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

    this.$modal.open(HapAirQualitySensorManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }
}
