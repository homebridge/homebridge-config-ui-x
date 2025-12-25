import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import jwt from 'jsonwebtoken'

import { UserDto } from '../../../modules/users/users.dto.js'
import { ConfigService } from '../../config/config.service.js'

@Injectable()
export class WsGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const client = context.switchToWs().getClient()
    try {
      jwt.verify(client.handshake.query.token, this.configService.secrets.secretKey) as UserDto
      return true
    } catch (e) {
      client.disconnect()
      return false
    }
  }
}
