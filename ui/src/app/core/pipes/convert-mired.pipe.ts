import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  name: 'convertMired',
  standalone: true,
})
export class ConvertMiredPipe implements PipeTransform {
  transform(mired: boolean | string | number): boolean | string | number {
    if (typeof mired !== 'number') {
      return mired
    }

    // Input a mired value and convert it to kelvin
    // Return a string like `500M | 2000K`
    const kelvin = 1000000 / mired
    const miredValue = Math.round(mired)
    const kelvinValue = Math.round(kelvin)
    return `${miredValue}M (${kelvinValue}K)`
  }
}
