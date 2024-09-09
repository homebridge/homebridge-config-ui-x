import { UseGuards } from '@nestjs/common'
import { WebSocketGateway } from '@nestjs/websockets'

import { WsGuard } from './core/auth/guards/ws.guard'

@UseGuards(WsGuard)
@WebSocketGateway({
  namespace: 'app',
  allowEIO3: true,
  cors: {
    origin: ['http://localhost:8080', 'http://localhost:4200'],
    credentials: true,
  },
})
export class AppGateway {}
