import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module.js'
import { FsModule } from '../../core/fs/fs.module.js'
import { SmartAutomationsGateway } from './smart-automations.gateway.js'
import { SmartAutomationsService } from './smart-automations.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    FsModule,
  ],
  providers: [
    SmartAutomationsService,
    SmartAutomationsGateway,
  ],
  exports: [
    SmartAutomationsService,
  ],
})
export class SmartAutomationsModule {}
