import * as https from 'https';
import { Module, HttpModule } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { PluginsService } from './plugins.service';
import { LoggerModule } from '../../core/logger/logger.module';
import { PluginsController } from './plugins.controller';
import { PluginsGateway } from './plugins.gateway';
import { ConfigModule } from '../../core/config/config.module';
import { NodePtyModule } from '../../core/node-pty/node-pty.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    HttpModule.register({
      headers: {
        'User-Agent': 'homebridge-config-ui-x',
      },
      timeout: 5000,
      httpsAgent: new https.Agent({ keepAlive: true }),
    }),
    NodePtyModule,
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    PluginsService,
    PluginsGateway,
  ],
  exports: [
    PluginsService,
  ],
  controllers: [
    PluginsController,
  ],
})
export class PluginsModule { }
