import { Module } from '@nestjs/common'

import { AuthModule } from '../../core/auth/auth.module'
import { ConfigModule } from '../../core/config/config.module'
import { LoggerModule } from '../../core/logger/logger.module'
import { SetupWizardController } from './setup-wizard.controller'

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    AuthModule,
  ],
  controllers: [SetupWizardController],
})
export class SetupWizardModule {}
