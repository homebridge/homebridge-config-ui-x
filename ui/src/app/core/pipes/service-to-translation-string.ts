import { Pipe, PipeTransform } from '@angular/core'

const RE_FIRST_UPPER = /^([A-Z])/
const RE_UPPER = /([A-Z])/g

@Pipe({
  name: 'serviceToTranslationString',
  standalone: true,
})
export class ServiceToTranslationStringPipe implements PipeTransform {
  transform(value: string): string {
    if (typeof value !== 'string' || !value) {
      return value
    }
    // Replace capital letters (except the first) with _ + lowercase
    const service = value
      .replace(RE_FIRST_UPPER, match => match.toLowerCase())
      .replace(RE_UPPER, match => `_${match.toLowerCase()}`)
    return `accessories.core.${service}`
  }
}
