import { Injectable } from '@nestjs/common'
import type { CanActivate } from '@nestjs/common'

import type { Observable } from 'rxjs'

import { ConfigService } from '../../core/config/config.service'

@Injectable()
export class SetupWizardGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
  ) {}

  canActivate(): boolean | Promise<boolean> | Observable<boolean> {
    return !this.configService.setupWizardComplete
  }
}
