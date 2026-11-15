import { Pipe, PipeTransform } from '@angular/core'

import { asNumber } from '@/app/core/accessories/types/hap/hap-values'

/**
 * Gives a hap characteristic value as a number, or `undefined` when it is
 * missing or not a number, for templates that compare or do sums with it.
 * For example: `service().values?.CurrentPosition | hapNumber`
 */
@Pipe({
  name: 'hapNumber',
  standalone: true,
})
export class HapNumberPipe implements PipeTransform {
  transform(value: unknown): number | undefined {
    return asNumber(value)
  }
}
