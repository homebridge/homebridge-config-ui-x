import { Inject, UseGuards } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets'

import { WsGuard } from '../../core/auth/guards/ws.guard.js'
import { devServerCorsConfig } from '../../core/cors.config.js'
import { SmartAutomationsService } from './smart-automations.service.js'

@UseGuards(WsGuard)
@WebSocketGateway({
  namespace: 'accessories',
  allowEIO3: true,
  cors: devServerCorsConfig,
})
export class SmartAutomationsGateway {
  constructor(
    @Inject(SmartAutomationsService) private readonly smartAutomationsService: SmartAutomationsService,
  ) {}

  @SubscribeMessage('get-smart-automations')
  async getSmartAutomations(client: any, payload: any) {
    try {
      return await this.smartAutomationsService.getSmartAutomations(payload.user)
    } catch (e) {
      return new WsException(e)
    }
  }

  @SubscribeMessage('save-smart-automation')
  async saveSmartAutomation(client: any, payload: any) {
    try {
      return await this.smartAutomationsService.saveSmartAutomation(payload.user, payload.automation)
    } catch (e) {
      return new WsException(e)
    }
  }

  @SubscribeMessage('delete-smart-automation')
  async deleteSmartAutomation(client: any, payload: any) {
    try {
      return await this.smartAutomationsService.deleteSmartAutomation(payload.user, payload.id)
    } catch (e) {
      return new WsException(e)
    }
  }
}
