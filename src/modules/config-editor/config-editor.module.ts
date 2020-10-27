import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigEditorService } from './config-editor.service';
import { ConfigEditorController } from './config-editor.controller';
import { ConfigModule } from '../../core/config/config.module';
import { LoggerModule } from '../../core/logger/logger.module';
import { SchedulerModule } from '../../core/scheduler/scheduler.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    LoggerModule,
    ConfigModule,
    SchedulerModule,
  ],
  providers: [
    ConfigEditorService,
  ],
  controllers: [
    ConfigEditorController,
  ],
  exports: [
    ConfigEditorService,
  ],
})
export class ConfigEditorModule { }
