import { Module } from '@nestjs/common'

import { Logger } from './logger.service.js'

@Module({
  providers: [Logger],
  exports: [Logger],
})
export class LoggerModule {}
