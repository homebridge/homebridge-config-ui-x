import { Module } from '@nestjs/common'

import { DirectConnectionController } from './direct-connection.controller.js'
import { DirectConnectionService } from './direct-connection.service.js'

@Module({
  controllers: [DirectConnectionController],
  providers: [DirectConnectionService],
  exports: [DirectConnectionService],
})
export class DirectConnectionModule { }
