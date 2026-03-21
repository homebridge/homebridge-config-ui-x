import { Pipe, PipeTransform } from '@angular/core'

const RE_HOSTNAME_PLACEHOLDER = /\$\{\{HOSTNAME\}\}/g

@Pipe({
  name: 'interpolateMd',
  standalone: true,
})
export class InterpolateMdPipe implements PipeTransform {
  transform(value: string): string {
    return value.replace(RE_HOSTNAME_PLACEHOLDER, location.hostname)
  }
}
