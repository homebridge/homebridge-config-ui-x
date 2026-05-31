import { Pipe, PipeTransform } from '@angular/core'

import { RE_FIRST_UPPER, RE_UPPER } from '@/app/core/regex.constants'

@Pipe({
  name: 'serviceToTranslationString',
  standalone: true,
})
export class ServiceToTranslationStringPipe implements PipeTransform {
  transform(value: string): string {
    if (typeof value !== 'string' || !value) {
      return value
    }

    // SmartSpeaker has no dedicated translation; it reuses the Speaker label
    if (value === 'SmartSpeaker') {
      return 'accessories.core.speaker'
    }

    // Replace capital letters (except the first) with _ + lowercase
    const service = value
      .replace(RE_FIRST_UPPER, match => match.toLowerCase())
      .replace(RE_UPPER, match => `_${match.toLowerCase()}`)
    return `accessories.core.${service}`
  }
}
