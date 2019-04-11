import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '../../../core/config/config.module';
import { LoggerModule } from '../../../core/logger/logger.module';
import { DockerService } from './docker.service';
import { DockerController } from './docker.controller';

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
export class DockerModule { }
