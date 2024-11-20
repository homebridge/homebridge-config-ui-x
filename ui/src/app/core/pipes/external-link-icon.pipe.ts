import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  name: 'externalLinkIcon',
  standalone: true,
})
export class ExternalLinkIconPipe implements PipeTransform {
  transform(value: string): unknown {
    return value.startsWith('https://github.com/') ? 'fab fa-fw fa-github' : 'fas fa-fw fa-question-circle'
  }
}
