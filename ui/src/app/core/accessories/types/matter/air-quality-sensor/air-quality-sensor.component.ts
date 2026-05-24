import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, createEnvironmentInjector, EnvironmentInjector, inject, input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { AirQualitySensorManageComponent } from '@/app/core/accessories/types/matter/air-quality-sensor/air-quality-sensor.manage.component'
import { getAirQualityValue, hasConcentrationData } from '@/app/core/accessories/types/matter/matter-device.utils'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-matter-air-quality-sensor',
  imports: [LowerCasePipe, TranslatePipe, LongClickDirective],
  standalone: true,
  templateUrl: './air-quality-sensor.component.html',
  styleUrl: './air-quality-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterAirQualitySensorComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()

  public labels = [
    'accessories.control.air_quality_unknown',
    'accessories.control.air_quality_good',
    'accessories.control.air_quality_fair',
    'accessories.control.air_quality_moderate',
    'accessories.control.air_quality_poor',
    'accessories.control.air_quality_very_poor',
    'accessories.control.air_quality_extremely_poor',
  ]

  public readonly airQuality = computed(() => getAirQualityValue(this.service()))

  public readonly canShowModal = computed(() => hasConcentrationData(this.service()))

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

    this.$modal.open(AirQualitySensorManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }
}
