import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import { ConfigService } from '../../core/config/config.service';

@Injectable()
export class SetupWizardGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
  ) { }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return !this.configService.setupWizardComplete;
  }
}
