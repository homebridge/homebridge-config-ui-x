import * as color from 'bash-color';
import { EventEmitter } from 'events';
import { UseGuards } from '@nestjs/common';
import { WebSocketGateway, SubscribeMessage, WsException } from '@nestjs/websockets';

import { Logger } from '../../core/logger/logger.service';
import { WsAdminGuard } from '../../core/auth/guards/ws-admin-guard';
import { BackupService } from './backup.service';

@UseGuards(WsAdminGuard)
@WebSocketGateway({ namespace: '/backup' })
export class BackupGateway {
  constructor(
    private backupService: BackupService,
    private logger: Logger,
  ) { }

  @SubscribeMessage('do-restore')
  async doRestore(client: EventEmitter) {
    try {
      return await this.backupService.restoreFromBackup(client);
    } catch (e) {
      this.logger.error(e);
      client.emit('stdout', '\n\r' + color.red(e.toString()) + '\n\r');
      return new WsException(e);
    }
  }

  @SubscribeMessage('do-restore-hbfx')
  async doRestoreHbfx(client: EventEmitter) {
    try {
      return await this.backupService.restoreHbfxBackup(client);
    } catch (e) {
      this.logger.error(e);
      client.emit('stdout', '\n\r' + color.red(e.toString()) + '\n\r');
      return new WsException(e);
    }
  }
}
