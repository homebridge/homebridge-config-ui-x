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
    // Return a string like `500M (2000K)`
    const miredValue = Math.round(mired)

    // Nothing to convert for a reading of zero or less: mireds are a reciprocal
    // measure, so zero is an infinite colour temperature and the label read
    // "0M (InfinityK)". No real bulb reports it, but a plugin can report
    // anything, and the raw reading on its own is the honest thing to show.
    if (mired <= 0) {
      return `${miredValue}M`
    }

    const kelvin = 1000000 / mired
    const kelvinValue = Math.round(kelvin)
    return `${miredValue}M (${kelvinValue}K)`
  }
}
