
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '../../config/config.service';
import { UserDto } from '../../../modules/users/users.dto';

@Injectable()
export class WsGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
  ) { }

  async canActivate(context: ExecutionContext) {
    const client = context.switchToWs().getClient();
    try {
      jwt.verify(client.handshake.query.token, this.configService.secrets.secretKey) as UserDto;
      return true;
    } catch (e) {
      client.disconnect();
      return false;
    }
  }
}
