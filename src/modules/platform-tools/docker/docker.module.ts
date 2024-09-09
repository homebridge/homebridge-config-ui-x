import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../../core/config/config.module'
import { LoggerModule } from '../../../core/logger/logger.module'
import { DockerController } from './docker.controller'
import { DockerService } from './docker.service'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    DockerService,
  ],
  controllers: [
    DockerController,
  ],
})
export class DockerModule {}
