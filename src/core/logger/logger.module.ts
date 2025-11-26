import { Global, Module } from '@nestjs/common'

import { Logger } from './logger.service.js'

@Global()
@Module({
  providers: [Logger],
  exports: [Logger],
})
export class LoggerModule {}
