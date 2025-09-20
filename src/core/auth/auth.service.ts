import { Buffer } from 'node:buffer'
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto'

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { pathExists, readJson, writeJson } from 'fs-extra'
import NodeCache from 'node-cache'
import { authenticator } from 'otplib'

import { UserDto } from '../../modules/users/users.dto'
import { ConfigService } from '../config/config.service'
import { Logger } from '../logger/logger.service'

@Injectable()
export class AuthService {
  private otpUsageCache = new NodeCache({ stdTTL: 90 })

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    this.checkAuthFile()

    // OTP options
    authenticator.options = {
      window: 1,
    }
  }

  /**
   * Authenticate a user with their credentials
   * @param username
   * @param password
   * @param otp
   */
  async authenticate(username: string, password: string, otp?: string): Promise<any> {
    try {
      const user = await this.findByUsername(username)

      if (!user) {
        throw new ForbiddenException()
      }

      await this.checkPassword(user, password)

      if (user.otpActive && !otp) {
        throw new HttpException('2FA Code Required', 412)
      }

      if (user.otpActive && !this.verifyOtpToken(user, otp)) {
        throw new HttpException('2FA Code Invalid', 412)
      }

      if (user) {
        return {
          username: user.username,
          name: user.name,
          admin: user.admin,
          instanceId: this.configService.instanceId,
        }
      }
    } catch (e) {
      if (e instanceof ForbiddenException) {
        this.logger.warn('Failed login attempt.')
        this.logger.warn('If you have forgotten your password, you can reset to the default '
          + `of admin/admin by deleting the "auth.json" file at ${this.configService.authPath} and then restarting Homebridge.`)
        throw e
      }

      if (e instanceof HttpException) {
        throw e
      }

      throw new ForbiddenException()
    }
  }

  /**
   * Authenticate and provide a JWT response
   * @param username
   * @param password
   * @param otp
   */
  async signIn(username: string, password: string, otp?: string): Promise<any> {
    const user = await this.authenticate(username, password, otp)
    const token = this.jwtService.sign(user)

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: this.configService.ui.sessionTimeout,
    }
  }

  /**
   * Verify as users username and password
   * This will throw an error if the credentials are incorrect.
   */
  private async checkPassword(user: UserDto, password: string) {
    const passwordAttemptHash = await this.hashPassword(password, user.salt)
    const passwordAttemptHashBuff = Buffer.from(passwordAttemptHash, 'hex')
    const knownPasswordHashBuff = Buffer.from(user.hashedPassword, 'hex')

    if (timingSafeEqual(passwordAttemptHashBuff, knownPasswordHashBuff)) {
      return user
    } else {
      throw new ForbiddenException()
    }
  }

  /**
   * Returns a token for use when authentication is disabled
   */
  async generateNoAuthToken() {
    // Prevent access if auth is not disabled
    if (this.configService.ui.auth !== 'none') {
      throw new UnauthorizedException()
    }

    // Load the first admin we can find
    const users = await this.getUsers()
    const user = users.find(x => x.admin === true)

    // Generate a token
    const token = this.jwtService.sign({
      username: user.username,
      name: user.name,
      admin: user.admin,
      instanceId: this.configService.instanceId,
    })

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: this.configService.ui.sessionTimeout,
    }
  }

  /**
   * Refresh an existing token to extend the session
   * @param user the current user payload from the JWT
   */
  async refreshToken(user: any): Promise<any> {
    // Validate that the user still exists and has the same permissions
    const currentUser = await this.findByUsername(user.username)
    if (!currentUser) {
      throw new UnauthorizedException('User no longer exists')
    }

    this.logger.log(`Request received to refresh token for ${user.username}.`)

    // Verify the user's admin status hasn't changed
    if (currentUser.admin !== user.admin) {
      throw new UnauthorizedException('User permissions have changed, please log in again')
    }

    // Check if the instance ID matches (prevents cross-instance token reuse)
    if (user.instanceId !== this.configService.instanceId) {
      throw new UnauthorizedException('Token is not valid for this instance')
    }

    // Generate a new token with the same user data but updated expiration
    const token = this.jwtService.sign({
      username: user.username,
      name: user.name,
      admin: user.admin,
      instanceId: user.instanceId,
    })

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: this.configService.ui.sessionTimeout,
    }
  }

  /**
   * Validate User
   * All information about the user we need is stored in the payload
   * @param payload the decoded, verified jwt payload
   */
  async validateUser(payload: any): Promise<any> {
    return payload
  }

  /**
   * Hash a password
   * @param password
   * @param salt
   */
  private async hashPassword(password: string, salt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      pbkdf2(password, salt, 1000, 64, 'sha512', (err, derivedKey) => {
        if (err) {
          return reject(err)
        }
        return resolve(derivedKey.toString('hex'))
      })
    })
  }

  /**
   * Generate a salt
   */
  private async genSalt(): Promise<string> {
    return new Promise((resolve, reject) => {
      randomBytes(32, (err, buf) => {
        if (err) {
          return reject(err)
        }
        return resolve(buf.toString('hex'))
      })
    })
  }

  /**
   * Set up the first user
   */
  async setupFirstUser(user: UserDto) {
    if (this.configService.setupWizardComplete) {
      throw new ForbiddenException()
    }

    if (!user.password) {
      throw new BadRequestException('Password missing.')
    }

    // First user must be admin
    user.admin = true

    await writeJson(this.configService.authPath, [])

    const createdUser = await this.addUser(user)

    this.configService.setupWizardComplete = true

    return createdUser
  }

  /**
   * Generates a token for the setup wizard
   */
  async generateSetupWizardToken() {
    // Prevent access if auth is not disabled
    if (this.configService.setupWizardComplete !== false) {
      throw new ForbiddenException()
    }

    // Generate a token
    const token = this.jwtService.sign({
      username: 'setup-wizard',
      name: 'setup-wizard',
      admin: true,
      instanceId: 'xxxxx', // intentionally wrong
    }, { expiresIn: '5m' })

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 300,
    }
  }

  /**
   * Executed on startup to see if the auth file is set up yet
   */
  async checkAuthFile() {
    if (!await pathExists(this.configService.authPath)) {
      this.configService.setupWizardComplete = false
      return
    }
    try {
      const authfile: UserDto[] = await readJson(this.configService.authPath)
      // There must be at least one admin user
      if (!authfile.find(x => x.admin === true)) {
        this.configService.setupWizardComplete = false
      }
    } catch (e) {
      this.configService.setupWizardComplete = false
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
    }
  }

  /**
   * Returns all the users
   * @param strip if true, remove the users salt and hashed password from the response
   */
  async getUsers(strip?: boolean): Promise<UserDto[]> {
    const users: UserDto[] = await readJson(this.configService.authPath)

    if (strip) {
      return users.map(this.desensitiseUserProfile)
    }

    return users
  }

  /**
   * Return a user by username
   * @param username
   */
  async findByUsername(username: string): Promise<UserDto> {
    const users = await this.getUsers()
    return users.find(x => x.username === username)
  }

  /**
   * Saves the user file
   * @param users
   */
  private async saveUserFile(users: UserDto[]) {
    // Update the auth.json
    return await writeJson(this.configService.authPath, users, { spaces: 4 })
  }

  /**
   * Add a new user
   * @param user
   */
  async addUser(user: UserDto) {
    const authfile = await this.getUsers()
    const salt = await this.genSalt()

    // User object
    const newUser: UserDto = {
      id: authfile.length ? Math.max(...authfile.map(x => x.id)) + 1 : 1,
      username: user.username,
      name: user.name,
      hashedPassword: await this.hashPassword(user.password, salt),
      salt,
      admin: user.admin,
    }

    // Check a user with the same username does not already exist
    if (authfile.find(x => x.username.toLowerCase() === newUser.username.toLowerCase())) {
      throw new ConflictException(`User with username '${newUser.username}' already exists.`)
    }

    // Add the user to the authfile
    authfile.push(newUser)

    // Update the auth.json
    await this.saveUserFile(authfile)
    this.logger.warn(`Added new user: ${user.username}.`)

    return this.desensitiseUserProfile(newUser)
  }

  /**
   * Remove a user
   * @param id
   */
  async deleteUser(id: number) {
    const authfile = await this.getUsers()

    const index = authfile.findIndex(x => x.id === id)

    if (index < 0) {
      throw new BadRequestException('User Not Found')
    }

    // Prevent deleting the only admin user
    if (authfile[index].admin && authfile.filter(x => x.admin === true).length < 2) {
      throw new BadRequestException('Cannot delete only admin user')
    }

    authfile.splice(index, 1)

    // Update the auth.json
    await this.saveUserFile(authfile)
    this.logger.warn(`Deleted user with ID ${id}.`)
  }

  /**
   * Updates a user
   * @param id
   * @param update
   */
  async updateUser(id: number, update: UserDto) {
    const authfile = await this.getUsers()

    const user = authfile.find(x => x.id === id)

    if (!user) {
      throw new BadRequestException('User Not Found')
    }

    if (user.username !== update.username) {
      if (authfile.find(x => x.username.toLowerCase() === update.username.toLowerCase())) {
        throw new ConflictException(`User with username '${update.username}' already exists.`)
      }

      this.logger.log(`Updated user: changed username from ${user.username} to ${update.username}.`)
      user.username = update.username
    }

    user.name = update.name || user.name
    user.admin = (update.admin === undefined) ? user.admin : update.admin

    if (update.password) {
      const salt = await this.genSalt()
      user.hashedPassword = await this.hashPassword(update.password, salt)
      user.salt = salt
    }

    // Update the auth.json
    await this.saveUserFile(authfile)
    this.logger.log(`Updated user: ${user.username}.`)

    return this.desensitiseUserProfile(user)
  }

  /**
   * Change a users own password
   */
  async updateOwnPassword(username: string, currentPassword: string, newPassword: string) {
    const authfile = await this.getUsers()
    const user = authfile.find(x => x.username === username)

    if (!user) {
      throw new NotFoundException('User not found.')
    }

    // This will throw an error of the password is wrong
    await this.checkPassword(user, currentPassword)

    // Generate a new salt
    const salt = await this.genSalt()
    user.hashedPassword = await this.hashPassword(newPassword, salt)
    user.salt = salt

    await this.saveUserFile(authfile)

    return this.desensitiseUserProfile(user)
  }

  /**
   * Generate an OTP secret for a user
   */
  async setupOtp(username: string) {
    const authfile = await this.getUsers()
    const user = authfile.find(x => x.username === username)

    if (!user) {
      throw new NotFoundException('User not found.')
    }

    if (user.otpActive) {
      throw new ForbiddenException('2FA has already been activated.')
    }

    user.otpSecret = authenticator.generateSecret()

    await this.saveUserFile(authfile)
    const appName = `Homebridge UI (${this.configService.instanceId.slice(0, 7)})`

    return {
      timestamp: new Date(),
      otpauth: authenticator.keyuri(user.username, appName, user.otpSecret),
    }
  }

  /**
   * Activates the OTP requirement for a user after verifying the otp code
   */
  async activateOtp(username: string, code: string) {
    const authfile = await this.getUsers()
    const user = authfile.find(x => x.username === username)

    if (!user) {
      throw new NotFoundException('User not found.')
    }

    if (!user.otpSecret) {
      throw new BadRequestException('2FA has not been setup.')
    }

    if (authenticator.verify({ token: code, secret: user.otpSecret })) {
      user.otpActive = true
      await this.saveUserFile(authfile)
      this.logger.warn(`Activated 2FA for ${user.username}.`)
      return this.desensitiseUserProfile(user)
    } else {
      throw new BadRequestException('2FA code is not valid.')
    }
  }

  /**
   * Deactivates the OTP requirement for a user after verifying their password
   */
  async deactivateOtp(username: string, password: string) {
    const authfile = await this.getUsers()
    const user = authfile.find(x => x.username === username)

    if (!user) {
      throw new NotFoundException('User not found.')
    }

    // This will throw an error if the password is not valid
    await this.checkPassword(user, password)

    user.otpActive = false
    delete user.otpSecret

    await this.saveUserFile(authfile)

    this.logger.warn(`Deactivated 2FA for ${username}.`)

    return this.desensitiseUserProfile(user)
  }

  /**
   * Verify an OTP token for a user and prevent it being used more than once
   */
  verifyOtpToken(user: UserDto, otp: string): boolean {
    const otpCacheKey = user.username + otp

    if (this.otpUsageCache.get(otpCacheKey)) {
      this.logger.warn(`${user.username} attempted to reuse one-time-password.`)
      return false
    }

    if (authenticator.verify({ token: otp, secret: user.otpSecret })) {
      this.otpUsageCache.set(otpCacheKey, 'true')
      return true
    }

    return false
  }
}
