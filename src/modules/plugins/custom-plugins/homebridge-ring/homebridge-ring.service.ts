import { Injectable, UnauthorizedException, HttpException, InternalServerErrorException } from '@nestjs/common';
import { Logger } from '../../../../core/logger/logger.service';
import axios from 'axios';

@Injectable()
export class HomebridgeRingService {
  constructor(
    private logger: Logger,
  ) { }

  /**
   * Exchange the users Ring Credentials for a Refresh Token
   */
  async exchangeCredentials(credentials) {
    try {
      return (await axios.post('https://oauth.ring.com/oauth/token',
        {
          client_id: 'ring_official_android',
          scope: 'client',
          grant_type: 'password',
          password: credentials.password,
          username: credentials.email,
        },
        {
          headers: {
            'content-type': 'application/json',
            '2fa-support': 'true',
            '2fa-code': credentials.twoFactorAuthCode || '',
          }
        })).data;
    } catch (e) {
      if (e.response && e.response.status === 412) {
        // 2fa required
        return new HttpException(e.response.data, 412);
      } else if (e.response.data) {
        return new UnauthorizedException(e.response.data);
      } else {
        this.logger.error('[homebridge-ring] - Failed to get credentials');
        this.logger.error(e);
        return new InternalServerErrorException();
      }
    }
  }
}
