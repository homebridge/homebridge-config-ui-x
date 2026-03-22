import { Pipe, PipeTransform } from '@angular/core'

import { RE_HOSTNAME_PLACEHOLDER } from '@/app/core/regex.constants'

@Pipe({
  name: 'interpolateMd',
  standalone: true,
})
export class InterpolateMdPipe implements PipeTransform {
  transform(value: string): string {
    return value.replace(RE_HOSTNAME_PLACEHOLDER, location.hostname)
  }
}
