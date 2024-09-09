import { Module } from '@nestjs/common'

import { NodePtyService } from './node-pty.service'

@Module({
  providers: [NodePtyService],
  exports: [NodePtyService],
})
export class NodePtyModule {}
