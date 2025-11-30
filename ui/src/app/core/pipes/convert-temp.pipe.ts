import { inject, Pipe, PipeTransform } from '@angular/core'

import { SettingsService } from '@/app/core/ui/settings.service'

@Pipe({
  name: 'convertTemp',
  standalone: true,
})
export class ConvertTempPipe implements PipeTransform {
  private $settings = inject(SettingsService)

  transform(value: number, unit: 'c' | 'f' = this.$settings.env.temperatureUnits): number {
    if (unit === 'f') {
      return Math.round((value * 1.8 + 32) * 10) / 10
    }
    return Math.round(value * 10) / 10
  }
}
