import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  name: 'interpolateMd',
})
export class InterpolateMdPipe implements PipeTransform {
  transform(value: string): unknown {
    return value.replace(/\$\{\{HOSTNAME\}\}/g, location.hostname)
  }
}
