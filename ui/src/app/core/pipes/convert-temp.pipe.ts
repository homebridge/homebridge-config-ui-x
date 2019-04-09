import { Pipe, PipeTransform } from '@angular/core';
import { AuthService } from '../auth/auth.service';

@Pipe({ name: 'convertTemp' })
export class ConvertTempPipe implements PipeTransform {
  constructor(
    private $auth: AuthService
  ) { }

  transform(value: number): number {
    if (this.$auth.env.temperatureUnits === 'f') {
      return value * 1.8 + 32;
    }
    return value;
  }
}
