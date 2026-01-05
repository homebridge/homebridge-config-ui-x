import { UseGuards } from '@nestjs/common'
import { WebSocketGateway } from '@nestjs/websockets'

import { WsGuard } from './core/auth/guards/ws.guard.js'
import { devServerCorsConfig } from './core/cors.config.js'

@UseGuards(WsGuard)
@WebSocketGateway({
  namespace: 'app',
  allowEIO3: true,
  cors: devServerCorsConfig,
})
export class AppGateway {}
