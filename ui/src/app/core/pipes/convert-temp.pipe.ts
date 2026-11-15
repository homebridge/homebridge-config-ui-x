import { inject, Pipe, PipeTransform } from '@angular/core'

import { SettingsService } from '@/app/core/ui/settings.service'

@Pipe({
  name: 'convertTemp',
  standalone: true,
})
export class ConvertTempPipe implements PipeTransform {
  private $settings = inject(SettingsService)

  /** A value that is not a number (a missing or `null` reading) gives `undefined`, so nothing is shown */
  transform(value: number | string | boolean | null | undefined, unit: 'c' | 'f' = this.$settings.env.temperatureUnits): number | undefined {
    if (typeof value !== 'number') {
      return undefined
    }
    if (unit === 'f') {
      return Math.round((value * 1.8 + 32) * 10) / 10
    }
    return Math.round(value * 10) / 10
  }
}
