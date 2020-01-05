import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AccessoriesService } from './accessories.service';
import { AccessoriesGateway } from './accessories.gateway';
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
})
export class AccessoriesModule { }
