import type { CanActivate } from '@nestjs/common'
import type { Observable } from 'rxjs'

import { Inject, Injectable } from '@nestjs/common'

import { ConfigService } from '../../core/config/config.service.js'

@Injectable()
export class SetupWizardGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  canActivate(): boolean | Promise<boolean> | Observable<boolean> {
    return !this.configService.setupWizardComplete
  }
}
