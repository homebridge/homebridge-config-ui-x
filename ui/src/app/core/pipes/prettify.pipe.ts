import { Pipe, PipeTransform } from '@angular/core'

const RE_UNDERSCORE = /_/g
const RE_CAMEL_CASE = /([a-z])([A-Z])/g
const RE_WORD_START = /\b\w/g

@Pipe({
  name: 'prettify',
  standalone: true,
})
export class PrettifyPipe implements PipeTransform {
  transform(value: string): string {
    if (typeof value !== 'string') {
      return value
    }

    // Values in hap are like this: SMOKE_NOT_DETECTED
    // Values in matter are like this: colorTempPhysicalMaxMireds

    // We need a common approach that works for both, to get them into:
    // SMOKE_NOT_DETECTED => Smoke Not Detected
    // colorTempPhysicalMaxMireds => Color Temp Physical Max Mireds

    return value
      .replace(RE_UNDERSCORE, ' ') // replace underscores with spaces
      .replace(RE_CAMEL_CASE, '$1 $2') // add space before capital letters
      .toLowerCase() // convert everything to lowercase first
      .replace(RE_WORD_START, match => match.toUpperCase()) // capitalize first letter of each word
      .trim() // remove leading/trailing spaces
  }
}
