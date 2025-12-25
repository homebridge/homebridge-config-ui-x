import { Module } from '@nestjs/common'

import { NodePtyService } from './node-pty.service.js'

@Module({
  providers: [NodePtyService],
  exports: [NodePtyService],
})
export class NodePtyModule {}
