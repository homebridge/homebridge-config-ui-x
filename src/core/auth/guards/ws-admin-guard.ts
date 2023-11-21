import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import { UserDto } from '../../../modules/users/users.dto';
import { ConfigService } from '../../config/config.service';

@Injectable()
export class WsAdminGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
  ) { }

  async canActivate(context: ExecutionContext) {
    const client = context.switchToWs().getClient();
    try {
      const user = verify(client.handshake.query.token, this.configService.secrets.secretKey) as UserDto;
      return user.admin;
    } catch (e) {
      client.disconnect();
      return false;
    }
  }
}
