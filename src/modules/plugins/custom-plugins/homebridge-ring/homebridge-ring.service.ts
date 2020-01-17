import { Injectable, UnauthorizedException, HttpException, InternalServerErrorException } from '@nestjs/common';
import { Logger } from '../../../../core/logger/logger.service';
import { ConfigService } from '../../../../core/config/config.service';
import * as rp from 'request-promise-native';

@Injectable()
export class HomebridgeRingService {
  constructor(
    private configService: ConfigService,
    private logger: Logger,
  ) { }

  /**
   * Exchange the users Ring Credentials for a Refresh Token
   */
  async exchangeCredentials(credentials) {
    console.log(credentials);
    try {
      return await rp.post('https://oauth.ring.com/oauth/token', {
        headers: {
          'content-type': 'application/json',
          '2fa-support': 'true',
          '2fa-code': credentials.twoFactorAuthCode || '',
        },
        json: {
          client_id: 'ring_official_android',
          scope: 'client',
          grant_type: 'password',
          password: credentials.password,
          username: credentials.email,
        },
      });
    } catch (e) {
      if (e.response && e.response.statusCode === 412) {
        // 2fa required
        return new HttpException(e.response.body, 412);
      } else if (e.response) {
        return new UnauthorizedException(e.response.body);
      } else {
        this.logger.error('[homebridge-ring] - Failed to get credentials');
        this.logger.error(e);
        return new InternalServerErrorException();
      }
    }
  }
}
