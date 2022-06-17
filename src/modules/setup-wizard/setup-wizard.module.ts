import { Module } from '@nestjs/common';

import { SetupWizardController } from './setup-wizard.controller';
import { AuthModule } from '../../core/auth/auth.module';
import { LoggerModule } from '../../core/logger/logger.module';
import { ConfigModule } from '../../core/config/config.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    AuthModule,
  ],
  controllers: [SetupWizardController]
})
export class SetupWizardModule { }
