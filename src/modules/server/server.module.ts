import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '../../core/config/config.module';
import { ServerService } from './server.service';
import { ServerController } from './server.controller';
import { LoggerModule } from '../../core/logger/logger.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    ServerService,
  ],
  controllers: [
    ServerController,
  ],
})
export class ServerModule { }
