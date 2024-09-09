import { SettingsService } from '@/app/core/settings.service'
import { Pipe, PipeTransform } from '@angular/core'

@Pipe({ name: 'convertTemp' })
export class ConvertTempPipe implements PipeTransform {
  constructor(
    private $settings: SettingsService,
  ) {}

  transform(value: number, unit: 'c' | 'f' = this.$settings.env.temperatureUnits): number {
    if (unit === 'f') {
      return value * 1.8 + 32
    }
    return value
  }
}
