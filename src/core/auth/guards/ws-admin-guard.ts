import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '../../config/config.service';
import { UserInterface } from '../auth.service';

@Injectable()
export class WsAdminGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
  ) { }

  async canActivate(context: ExecutionContext) {
    const client = context.switchToWs().getClient();
    try {
      const user = jwt.verify(client.handshake.query.token, this.configService.secrets.secretKey) as UserInterface;
      return user.admin;
    } catch (e) {
      client.disconnect();
      return false;
    }
  }
}