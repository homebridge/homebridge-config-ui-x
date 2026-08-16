import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  name: 'duration',
  standalone: true,
})
export class DurationPipe implements PipeTransform {
  transform(value: number): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return ''
    }
    const minutes = Math.floor(value / 60)
    const seconds = value % 60
    return [
      minutes > 0 ? `${minutes.toString()}m` : '',
      seconds > 0 ? `${seconds.toString()}s` : '',
    ].filter(Boolean).join(' ') || '0s'
  }
}
