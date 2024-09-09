import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  name: 'interpolateMd',
})
export class InterpolateMdPipe implements PipeTransform {
  // eslint-disable-next-line unused-imports/no-unused-vars
  transform(value: string, ...args: unknown[]): unknown {
    return value
      .replace(/\$\{\{HOSTNAME\}\}/g, location.hostname)
  }
}
