import { ChangeDetectionStrategy, Component } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

@Component({
  selector: 'app-air-quality-sensor-manage',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './air-quality-sensor.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HapAirQualitySensorManageComponent extends BaseManageComponent {
  public labels = ['Unknown', 'Excellent', 'Good', 'Fair', 'Inferior', 'Poor']

  public airQuality = 0
  public pm25: number | null = null
  public pm10: number | null = null
  public ozone: number | null = null
  public no2: number | null = null
  public so2: number | null = null
  public voc: number | null = null

  protected setupComponent() {
    this.updateFromService()
  }

  protected handleAccessoryUpdate() {
    this.updateFromService()
  }

  private updateFromService() {
    this.airQuality = this.service.values?.AirQuality ?? 0
    this.pm25 = this.service.values?.PM2_5Density ?? null
    this.pm10 = this.service.values?.PM10Density ?? null
    this.ozone = this.service.values?.OzoneDensity ?? null
    this.no2 = this.service.values?.NitrogenDioxideDensity ?? null
    this.so2 = this.service.values?.SulphurDioxideDensity ?? null
    this.voc = this.service.values?.VOCDensity ?? null
  }

  public get hasReadings(): boolean {
    return this.pm25 !== null
      || this.pm10 !== null
      || this.ozone !== null
      || this.no2 !== null
      || this.so2 !== null
      || this.voc !== null
  }
}
