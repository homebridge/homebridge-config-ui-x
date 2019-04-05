import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { JwtService } from '@nestjs/jwt';
import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';
import { WsException } from '@nestjs/websockets';

export interface UserInterface {
  id: number;
  name: string;
  username: string;
  admin: boolean;
  hashedPassword: string;
  salt: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    this.setupAuthFile();
  }

  /**
   * Authenticate a user with their credentials
   * @param username
   * @param password
   */
  async authenticate(username: string, password: string): Promise<any> {
    try {
      const user = await this.doLogin(username, password)
      if (user) {
        return {
          username: user.username,
          name: user.name,
          admin: user.admin,
        }
      }
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

  /**
   * Verify a token is signed correctly
   * @param token 
   */
  async verifyWsConnection(client) {
    try {
      return jwt.verify(client.handshake.query.token, this.configService.secrets.secretKey);
    } catch (e) {
      client.disconnect();
      throw new WsException('Unauthorized')
    }
  }
  /**
   * Returns all the users
   */
  async getUsers(): Promise<UserInterface[]> {
    const users = await fs.readJson(this.configService.authPath);
    return users;
  }


  /**
   * Return a user by it's id
   * @param id 
   */
  async findById(id: number): Promise<UserInterface> {
    const users = await this.getUsers();
    const user = users.find(x => x.id === id);
    return user;
  }

  /**
   * Return a user by it's username
   * @param username 
   */
  async findByUsername(username: string): Promise<UserInterface> {
    const users = await this.getUsers();
    const user = users.find(x => x.username === username);
    return user;
  }

  /**
   * Saves the user file
   * @param users
   */
  private async saveUserFile(users: UserInterface[]) {
    // update the auth.json
    return await fs.writeJson(this.configService.authPath, users, { spaces: 4 });
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
    })
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
   * Verify as users username and password
   * @param username 
   * @param password 
   */
  private async doLogin(username: string, password: string) {
    const user = await this.findByUsername(username);

    if (!user) {
      throw new ForbiddenException();
    }

    const hashedPassword = await this.hashPassword(password, user.salt);

    if (hashedPassword === user.hashedPassword) {
      return user;
    } else {
      throw new ForbiddenException();
    }
  }

  /**
   * Add a new user
   * @param user 
   */
  async addUser(user) {
    const authfile = await this.getUsers();
    const salt = await this.genSalt();

    // user object
    const newUser: UserInterface = {
      id: authfile.length ? Math.max.apply(Math, authfile.map(x => x.id)) + 1 : 1,
      username: user.username,
      name: user.name,
      hashedPassword: await this.hashPassword(user.password, salt),
      salt: salt,
      admin: user.admin
    };

    // add the user to the authfile
    authfile.push(newUser);

    // update the auth.json
    await this.saveUserFile(authfile);
    this.logger.warn(`Added new user: ${user.username}`);
  }

  /**
   * Remove a user
   * @param id 
   */
  async deleteUser(id) {
    const authfile = await this.getUsers();

    const index = authfile.findIndex(x => x.id === parseInt(id, 10));

    if (index < 0) {
      throw new Error('User not found');
    }

    // prevent deleting the only admin user
    if (authfile[index].admin && authfile.filter(x => x.admin === true).length < 2) {
      throw new Error('Cannot delete only admin user');
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
  async updateUser(userId, update) {
    const authfile = await this.getUsers();

    const user = authfile.find(x => x.id === userId);

    if (!user) {
      throw new Error('User Not Found');
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
  }

  /**
   * Setup the default user
   */
  async setupDefaultUser() {
    return this.addUser({
      'username': 'admin',
      'password': 'admin',
      'name': 'Administrator',
      'admin': true
    });
  }

  /**
   * Executed on startup to ensure there is at least one admin
   */
  async setupAuthFile() {
    if (!await fs.pathExists(this.configService.authPath)) {
      await fs.writeJson(this.configService.authPath, []);
    }

    const authfile = await this.getUsers();

    // if there are no admin users, add the default user
    if (!authfile.find(x => x.admin === true || x.username === 'admin')) {
      await this.setupDefaultUser();
    }
  }
}
