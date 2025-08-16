import { Pipe, PipeTransform } from '@angular/core'

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
      .replace(/^([A-Z])/, match => match.toLowerCase())
      .replace(/([A-Z])/g, match => `_${match.toLowerCase()}`)
    return `accessories.core.${service}`
  }
}
