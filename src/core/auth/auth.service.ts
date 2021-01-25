import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { JwtService } from '@nestjs/jwt';
import { Injectable, ForbiddenException, BadRequestException, UnauthorizedException, ConflictException, NotFoundException, HttpException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import * as NodeCache from 'node-cache';
import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';
import { UserDto } from '../../modules/users/users.dto';

@Injectable()
export class AuthService {
  private otpUsageCache = new NodeCache({ stdTTL: 90 });

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    this.setupAuthFile();

    // otp options
    authenticator.options = {
      window: 1,
    };
  }

  /**
   * Authenticate a user with their credentials
   * @param username
   * @param password
   */
  async authenticate(username: string, password: string, otp?: string): Promise<any> {
    try {
      const user = await this.findByUsername(username);

      if (!user) {
        throw new ForbiddenException();
      }

      await this.checkPassword(user, password);

      if (user.otpActive && !otp) {
        throw new HttpException('2FA Code Required', 412);
      }

      if (user.otpActive && !this.verifyOtpToken(user, otp)) {
        throw new HttpException('2FA Code Invalid', 412);
      }

      if (user) {
        return {
          username: user.username,
          name: user.name,
          admin: user.admin,
          instanceId: this.configService.instanceId,
        };
      }
    } catch (e) {
      if (e instanceof ForbiddenException) {
        this.logger.warn('Failed login attempt');
        this.logger.warn('If you\'ve forgotten your password you can reset to the default ' +
          `of admin/admin by deleting the "auth.json" file (${this.configService.authPath}) and then restarting Homebridge.`);
        throw e;
      }

      if (e instanceof HttpException) {
        throw e;
      }

      throw new ForbiddenException();
    }
  }

  /**
   * Authenticate and provide a JWT response
   * @param username
   * @param password
   */
  async signIn(username: string, password: string, otp?: string): Promise<any> {
    const user = await this.authenticate(username, password, otp);
    const token = await this.jwtService.sign(user);

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: this.configService.ui.sessionTimeout,
    };
  }

  /**
   * Verify as users username and password
   * This will throw an error if the credentials are incorrect.
   */
  private async checkPassword(user: UserDto, password: string) {
    const hashedPassword = await this.hashPassword(password, user.salt);

    if (hashedPassword === user.hashedPassword) {
      return user;
    } else {
      throw new ForbiddenException();
    }
  }

  /**
   * Returns a token for use when authentication is disabled
   */
  async generateNoAuthToken() {
    // prevent access if auth is not disabled
    if (this.configService.ui.auth !== 'none') {
      throw new UnauthorizedException();
    }

    // load the first admin we can find
    const users = await this.getUsers();
    const user = users.find(x => x.admin === true);

    // generate a token
    const token = await this.jwtService.sign({
      username: user.username,
      name: user.name,
      admin: user.admin,
      instanceId: this.configService.instanceId,
    });

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: this.configService.ui.sessionTimeout,
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

  /**
   * Verify a token is signed correctly
   * @param token
   */
  async verifyWsConnection(client) {
    try {
      return jwt.verify(client.handshake.query.token, this.configService.secrets.secretKey);
    } catch (e) {
      client.disconnect();
      throw new WsException('Unauthorized');
    }
  }

  /**
   * Hash a password
   * @param password
   * @param salt
   */
  private async hashPassword(password: string, salt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, 1000, 64, 'sha512', (err, derivedKey) => {
        if (err) return reject(err);
        return resolve(derivedKey.toString('hex'));
      });
    });
  }

  /**
   * Generate a salt
   */
  private async genSalt(): Promise<string> {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(32, (err, buf) => {
        if (err) return reject(err);
        return resolve(buf.toString('hex'));
      });
    });
  }

  /**
   * Setup the default user
   */
  async setupDefaultUser() {
    await this.addUser({
      username: 'admin',
      password: 'admin',
      name: 'Administrator',
      admin: true,
    });
    this.logger.log('Username and password have been set to default:');
    this.logger.log('Username: admin');
    this.logger.log('Password: admin');
  }

  /**
   * Executed on startup to ensure there is at least one admin
   */
  async setupAuthFile() {
    if (!await fs.pathExists(this.configService.authPath)) {
      await fs.writeJson(this.configService.authPath, []);
    }

    // try and read the auth.json file, if it's corrupted
    let authfile;
    try {
      authfile = await this.getUsers();
    } catch (e) {
      this.logger.error(`Failed to read auth.json file at ${this.configService.authPath}.`);
      await fs.writeJson(this.configService.authPath, []);
      authfile = await this.getUsers();
    }

    // if there are no admin users, add the default user
    if (!authfile.find(x => x.admin === true || x.username === 'admin')) {
      await this.setupDefaultUser();
    }
  }

  /**
   * Clean the user profile of se
   */
  desensitiseUserProfile(user: UserDto): UserDto {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      admin: user.admin,
      otpActive: user.otpActive || false,
    };
  }

  /**
   * Returns all the users
   * @param strip if true, remove the users salt and hashed password from the response
   */
  async getUsers(strip?: boolean): Promise<UserDto[]> {
    const users: UserDto[] = await fs.readJson(this.configService.authPath);

    if (strip) {
      return users.map(this.desensitiseUserProfile);
    }

    return users;
  }

  /**
   * Return a user by it's id
   * @param id
   */
  async findById(id: number): Promise<UserDto> {
    const users = await this.getUsers();
    const user = users.find(x => x.id === id);
    return user;
  }

  /**
   * Return a user by it's username
   * @param username
   */
  async findByUsername(username: string): Promise<UserDto> {
    const users = await this.getUsers();
    const user = users.find(x => x.username === username);
    return user;
  }

  /**
   * Saves the user file
   * @param users
   */
  private async saveUserFile(users: UserDto[]) {
    // update the auth.json
    return await fs.writeJson(this.configService.authPath, users, { spaces: 4 });
  }

  /**
   * Add a new user
   * @param user
   */
  async addUser(user) {
    const authfile = await this.getUsers();
    const salt = await this.genSalt();

    // user object
    const newUser: UserDto = {
      id: authfile.length ? Math.max(...authfile.map(x => x.id)) + 1 : 1,
      username: user.username,
      name: user.name,
      hashedPassword: await this.hashPassword(user.password, salt),
      salt,
      admin: user.admin,
    };

    // check a user with the same username does not already exist
    if (authfile.find(x => x.username.toLowerCase() === newUser.username.toLowerCase())) {
      throw new ConflictException(`User with username '${newUser.username}' already exists.`);
    }

    // add the user to the authfile
    authfile.push(newUser);

    // update the auth.json
    await this.saveUserFile(authfile);
    this.logger.warn(`Added new user: ${user.username}`);

    return this.desensitiseUserProfile(newUser);
  }

  /**
   * Remove a user
   * @param id
   */
  async deleteUser(id: number) {
    const authfile = await this.getUsers();

    const index = authfile.findIndex(x => x.id === id);

    if (index < 0) {
      throw new BadRequestException('User Not Found');
    }

    // prevent deleting the only admin user
    if (authfile[index].admin && authfile.filter(x => x.admin === true).length < 2) {
      throw new BadRequestException('Cannot delete only admin user');
    }

    authfile.splice(index, 1);

    // update the auth.json
    await this.saveUserFile(authfile);
    this.logger.warn(`Deleted user with ID ${id}`);
  }

  /**
   * Updates a user
   * @param userId
   * @param update
   */
  async updateUser(id: number, update: UserDto) {
    const authfile = await this.getUsers();

    const user = authfile.find(x => x.id === id);

    if (!user) {
      throw new BadRequestException('User Not Found');
    }

    if (user.username !== update.username) {
      if (authfile.find(x => x.username.toLowerCase() === update.username.toLowerCase())) {
        throw new ConflictException(`User with username '${update.username}' already exists.`);
      }

      this.logger.log(`Updated user: Changed username from '${user.username}' to '${update.username}'`);
      user.username = update.username;
    }

    user.name = update.name || user.name;
    user.admin = (update.admin === undefined) ? user.admin : update.admin;

    if (update.password) {
      const salt = await this.genSalt();
      user.hashedPassword = await this.hashPassword(update.password, salt);
      user.salt = salt;
    }

    // update the auth.json
    this.saveUserFile(authfile);
    this.logger.log(`Updated user: ${user.username}`);

    return this.desensitiseUserProfile(user);
  }

  /**
   * Change a users own password
   */
  async updateOwnPassword(username, currentPassword: string, newPassword: string) {
    const authfile = await this.getUsers();
    const user = authfile.find(x => x.username === username);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    // this will throw an error of the password is wrong
    await this.checkPassword(user, currentPassword);

    // generate a new salf
    const salt = await this.genSalt();
    user.hashedPassword = await this.hashPassword(newPassword, salt);
    user.salt = salt;

    await this.saveUserFile(authfile);

    return this.desensitiseUserProfile(user);
  }

  /**
   * Generate an OTP secret for a user
   */
  async setupOtp(username: string) {
    const authfile = await this.getUsers();
    const user = authfile.find(x => x.username === username);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.otpActive) {
      throw new ForbiddenException('2FA has already been activated.');
    }

    user.otpSecret = authenticator.generateSecret();

    await this.saveUserFile(authfile);
    const appName = `Homebridge UI (${this.configService.instanceId.slice(0, 7)})`;

    return {
      timestamp: new Date(),
      otpauth: authenticator.keyuri(user.username, appName, user.otpSecret),
    };
  }

  /**
   * Activates the OTP requirement for a user after verifying the otp code
   */
  async activateOtp(username: string, code: string) {
    const authfile = await this.getUsers();
    const user = authfile.find(x => x.username === username);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (!user.otpSecret) {
      throw new BadRequestException('2FA has not been setup.');
    }

    if (authenticator.verify({ token: code, secret: user.otpSecret })) {
      user.otpActive = true;
      await this.saveUserFile(authfile);
      this.logger.warn(`Activated 2FA for '${user.username}'.`);
      return this.desensitiseUserProfile(user);
    } else {
      throw new BadRequestException('2FA code is not valid.');
    }
  }

  /**
   * Deactivates the OTP requirement for a user after verifying their password
   */
  async deactivateOtp(username: string, password: string) {
    const authfile = await this.getUsers();
    const user = authfile.find(x => x.username === username);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    // this will throw an error if the password is not valid
    await this.checkPassword(user, password);

    user.otpActive = false;
    delete user.otpSecret;

    await this.saveUserFile(authfile);

    this.logger.warn(`Deactivated 2FA for '${username}'.`);

    return this.desensitiseUserProfile(user);
  }

  /**
   * Verify an OTP token for a user and prevent it being used more than once
   */
  verifyOtpToken(user: UserDto, otp: string): boolean {
    const otpCacheKey = user.username + otp;

    if (this.otpUsageCache.get(otpCacheKey)) {
      this.logger.warn(`[${user.username}] attempted to reuse one-time-password.`);
      return false;
    }

    if (authenticator.verify({ token: otp, secret: user.otpSecret })) {
      this.otpUsageCache.set(otpCacheKey, 'true');
      return true;
    }

    return false;
  }
}
