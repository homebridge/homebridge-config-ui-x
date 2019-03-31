import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '../config/config.service';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
  ) { }

  async canActivate(context: ExecutionContext) {
    const client = context.switchToWs().getClient();
    try {
      const user = jwt.verify(client.handshake.query.token, this.configService.secrets.secretKey);
      return true;
    } catch (e) {
      client.disconnect();
      return false;
    }
  }
}