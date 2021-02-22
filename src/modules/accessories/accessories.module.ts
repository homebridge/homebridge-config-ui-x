import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AccessoriesService } from './accessories.service';
import { AccessoriesGateway } from './accessories.gateway';
import { AccessoriesController } from './accessories.controller';
import { ConfigModule } from '../../core/config/config.module';
import { LoggerModule } from '../../core/logger/logger.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    AccessoriesService,
    AccessoriesGateway,
  ],
  exports: [
    AccessoriesService,
  ],
  controllers: [
    AccessoriesController,
  ],
})
export class AccessoriesModule { }
