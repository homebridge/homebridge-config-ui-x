import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, HttpException, InternalServerErrorException } from '@nestjs/common';
import { Logger } from '../../../../core/logger/logger.service';
import { ConfigService } from '../../../../core/config/config.service';
import * as rp from 'request-promise-native';
import { machineId } from 'node-machine-id';
import * as generateRandomUuid from 'uuid/v4';
import * as generateUuidFromNamespace from 'uuid/v5';

@Injectable()
export class HomebridgeRingService {
  private uuidNamespace = 'e53ffdc0-e91d-4ce1-bec2-df939d94739c';

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
          hardware_id: await this.getHardwareId(),
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

  generateUuid(seed?: string) {
    if (seed) {
      return generateUuidFromNamespace(seed, this.uuidNamespace);
    }

    return generateRandomUuid();
  }

  async getHardwareId() {
    const id = await machineId();
    return this.generateUuid(id);
  }

}