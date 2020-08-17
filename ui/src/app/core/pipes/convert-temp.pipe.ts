import { Pipe, PipeTransform } from '@angular/core';
import { AuthService } from '../auth/auth.service';

@Pipe({ name: 'convertTemp' })
export class ConvertTempPipe implements PipeTransform {
  constructor(
    private $auth: AuthService,
  ) { }

  transform(value: number, unit: 'c' | 'f' = this.$auth.env.temperatureUnits): number {
    if (unit === 'f') {
      return value * 1.8 + 32;
    }
    return value;
  }
}
