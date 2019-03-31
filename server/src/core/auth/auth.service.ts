import { JwtService } from '@nestjs/jwt';
import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Authenticate a user with their credentials
   * @param username
   * @param password
   */
  async authenticate(username: string, password: string): Promise<any> {
    try {

      return {
        admin: true,
      };
      // validate user

    } catch (e) {
      throw new ForbiddenException();
    }
  }

  /**
   * Authenticate and provide a JWT response
   * @param username
   * @param password
   */
  async signIn(username: string, password: string): Promise<any> {
    const user = await this.authenticate(username, password);
    const token = await this.jwtService.sign(user);

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 28800,
    };
  }

  /**
   * Validate User
   * All information about the user we need is stored in the payload
   * @param payload the decoded, verified jwt payload
   */
  async validateUser(payload): Promise<any> {
    return payload;
  }
}
