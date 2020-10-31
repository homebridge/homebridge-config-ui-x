import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'externalLinkIcon',
})
export class ExternalLinkIconPipe implements PipeTransform {

  transform(value: string, ...args: unknown[]): unknown {
    return value.startsWith('https://github.com') ? 'fab fa-github' : 'fas fa-question-circle';
  }

}
