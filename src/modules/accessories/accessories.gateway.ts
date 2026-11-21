import { Inject, UseGuards } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets'

import { getWsUser } from '../../core/auth/guards/ws-token.js'
import { WsGuard } from '../../core/auth/guards/ws.guard.js'
import { devServerCorsConfig } from '../../core/cors.config.js'
import { AccessoriesService } from './accessories.service.js'
import { parseSaveAccessoryMetadata } from './accessory-metadata.dto.js'

@UseGuards(WsGuard)
@WebSocketGateway({
  namespace: 'accessories',
  allowEIO3: true,
  cors: devServerCorsConfig,
})
export class AccessoriesGateway {
  constructor(
    @Inject(AccessoriesService) private readonly accessoriesService: AccessoriesService,
  ) {}

  @SubscribeMessage('get-accessories')
  connect(client: any, payload: any) {
    // Deliberately not awaited - but it must not be left to reject unhandled
    // either: there is no global unhandledRejection handler, so a rejection
    // here would take the whole UI process down.
    this.accessoriesService.connect(client).catch((e) => {
      client.emit('accessory-control-failure', e.message)
    })
  }

  // The layout is per user: the user is the one the guard verified the token for. The `user` the client sends in
  // the message is ignored, or any signed-in user could read or replace another user's (or an admin's) layout.
  @SubscribeMessage('get-layout')
  async getAccessoryLayout(client: any) {
    const user = getWsUser(client)
    if (!user) {
      return new WsException('Unauthorized')
    }
    return await this.accessoriesService.getAccessoryLayout(user.username)
  }

  @SubscribeMessage('save-layout')
  async saveAccessoryLayout(client: any, payload: any) {
    const user = getWsUser(client)
    if (!user) {
      return new WsException('Unauthorized')
    }
    try {
      return await this.accessoriesService.saveAccessoryLayout(user.username, payload?.layout)
    } catch (e) {
      return new WsException(e)
    }
  }

  // Labels and floors are per user, identified by the verified socket user; the client cannot name another user.
  @SubscribeMessage('get-metadata')
  async getAccessoryMetadata(client: any) {
    const user = getWsUser(client)
    if (!user) {
      return new WsException('Unauthorized')
    }
    return await this.accessoriesService.getAccessoryMetadata(user.username)
  }

  @SubscribeMessage('save-metadata')
  async saveAccessoryMetadata(client: any, payload: any) {
    const user = getWsUser(client)
    if (!user) {
      return new WsException('Unauthorized')
    }
    try {
      const data = await parseSaveAccessoryMetadata(payload)
      return await this.accessoriesService.saveAccessoryMetadata(user.username, data)
    } catch (e) {
      return new WsException(e?.message ?? 'Invalid accessory metadata')
    }
  }
}
