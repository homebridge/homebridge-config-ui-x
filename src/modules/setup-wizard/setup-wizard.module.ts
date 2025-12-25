import { Module } from '@nestjs/common'

import { AuthModule } from '../../core/auth/auth.module.js'
import { ConfigModule } from '../../core/config/config.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { SetupWizardController } from './setup-wizard.controller.js'

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    AuthModule,
  ],
  controllers: [SetupWizardController],
})
export class SetupWizardModule {}
