import { ChangeDetectionStrategy, Component } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import {
  getAirQualityValue,
  getCarbonMonoxideValue,
  getConcentrationUnit,
  getNitrogenDioxideValue,
  getOzoneValue,
  getPm10Value,
  getPm25Value,
  hasConcentrationData,
} from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-air-quality-sensor-manage',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './air-quality-sensor.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AirQualitySensorManageComponent extends BaseManageComponent {
  public labels = [
    'accessories.control.air_quality_unknown',
    'accessories.control.air_quality_good',
    'accessories.control.air_quality_fair',
    'accessories.control.air_quality_moderate',
    'accessories.control.air_quality_poor',
    'accessories.control.air_quality_very_poor',
    'accessories.control.air_quality_extremely_poor',
  ]

  public airQuality = 0
  public pm25: number | null = null
  public pm10: number | null = null
  public co: number | null = null
  public no2: number | null = null
  public ozone: number | null = null
  public pm25Unit = 'µg/m³'
  public pm10Unit = 'µg/m³'
  public coUnit = 'ppm'
  public no2Unit = 'ppb'
  public ozoneUnit = 'ppb'

  protected setupComponent() {
    this.updateFromService()
  }

  protected handleAccessoryUpdate() {
    this.updateFromService()
  }

  private updateFromService() {
    this.airQuality = getAirQualityValue(this.service)
    this.pm25 = getPm25Value(this.service)
    this.pm10 = getPm10Value(this.service)
    this.co = getCarbonMonoxideValue(this.service)
    this.no2 = getNitrogenDioxideValue(this.service)
    this.ozone = getOzoneValue(this.service)

    if (this.pm25 !== null) {
      this.pm25Unit = getConcentrationUnit(this.service, 'pm25ConcentrationMeasurement')
    }
    if (this.pm10 !== null) {
      this.pm10Unit = getConcentrationUnit(this.service, 'pm10ConcentrationMeasurement')
    }
    if (this.co !== null) {
      this.coUnit = getConcentrationUnit(this.service, 'carbonMonoxideConcentrationMeasurement')
    }
    if (this.no2 !== null) {
      this.no2Unit = getConcentrationUnit(this.service, 'nitrogenDioxideConcentrationMeasurement')
    }
    if (this.ozone !== null) {
      this.ozoneUnit = getConcentrationUnit(this.service, 'ozoneConcentrationMeasurement')
    }
  }

  public get hasConcentration(): boolean {
    return hasConcentrationData(this.service)
  }
}
