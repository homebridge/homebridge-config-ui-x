import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  name: 'interpolateMd',
  standalone: true,
})
export class InterpolateMdPipe implements PipeTransform {
  transform(value: string): string {
    return value.replace(/\$\{\{HOSTNAME\}\}/g, location.hostname)
  }
}
