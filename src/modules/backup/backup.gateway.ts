import type { EventEmitter } from 'node:events'

import { Inject, UseGuards } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets'
import { red } from 'bash-color'

import { WsAdminGuard } from '../../core/auth/guards/ws-admin-guard.js'
import { Logger } from '../../core/logger/logger.service.js'
import { BackupService } from './backup.service.js'

@UseGuards(WsAdminGuard)
@WebSocketGateway({
  namespace: '/backup',
  allowEIO3: true,
  cors: {
    origin: ['http://localhost:8080', 'http://localhost:4200'],
    credentials: true,
  },
})
export class BackupGateway {
  constructor(
    @Inject(BackupService) private readonly backupService: BackupService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  @SubscribeMessage('do-restore')
  async doRestore(client: EventEmitter) {
    try {
      return await this.backupService.restoreFromBackup(client)
    } catch (e) {
      this.logger.error(e)
      client.emit('stdout', `\n\r${red(e.toString())}\n\r`)
      return new WsException(e)
    }
  }

  @SubscribeMessage('do-restore-hbfx')
  async doRestoreHbfx(client: EventEmitter) {
    try {
      return await this.backupService.restoreHbfxBackup(client)
    } catch (e) {
      this.logger.error(e)
      client.emit('stdout', `\n\r${red(e.toString())}\n\r`)
      return new WsException(e)
    }
  }
}
