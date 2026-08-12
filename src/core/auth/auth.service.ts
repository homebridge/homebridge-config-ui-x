import { Buffer } from 'node:buffer'
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto'

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { createGuardrails } from '@otplib/core'
import { pathExists, readJson } from 'fs-extra/esm'
import NodeCache from 'node-cache'
import { generateSecret, generateURI, verify } from 'otplib'

import { UserDto } from '../../modules/users/users.dto.js'
import { ConfigService } from '../config/config.service.js'
import { JsonFileStoreService } from '../fs/json-file-store.service.js'
import { Logger } from '../logger/logger.service.js'

// OWASP-recommended PBKDF2-HMAC-SHA512 work factor. New and changed passwords
// are hashed at this strength.
const PBKDF2_ITERATIONS = 210000
// Records created before versioned hashing carry no iteration count and were
// hashed at 1,000. They verify at this count and are transparently upgraded to
// PBKDF2_ITERATIONS on the owner's next successful login.
const LEGACY_PBKDF2_ITERATIONS = 1000

// Login throttling: after this many failed attempts for a given key the account
// is locked out for LOGIN_LOCKOUT_SECONDS. Guards against online password and
// 2FA guessing, which was otherwise unlimited.
const MAX_LOGIN_FAILURES = 10
const LOGIN_LOCKOUT_SECONDS = 300

// How long the auth file is cached for per-request token validation. Writes
// that change a user's identity or role clear it immediately, so this is only
// the ceiling for changes made outside this process (e.g. editing auth.json by
// hand).
const USER_CACHE_TTL_SECONDS = 5

@Injectable()
export class AuthService {
  private otpUsageCache = new NodeCache({ stdTTL: 90 })

  // Counts recent failed logins per key (normalised username + client address).
  // A failed attempt refreshes the TTL, so sustained guessing keeps the account
  // locked; the count clears after LOGIN_LOCKOUT_SECONDS of no attempts.
  private loginFailureCache = new NodeCache({ stdTTL: LOGIN_LOCKOUT_SECONDS })

  // Short-lived cache of the auth file, so validating a token on every request
  // is not a file read each time. Cleared by invalidateUserCache() on writes.
  private userCache = new NodeCache({ stdTTL: USER_CACHE_TTL_SECONDS })

  // Synchronous reservation flag for first-user setup, so two concurrent
  // onboarding requests cannot both create an administrator. See setupFirstUser.
  private firstUserSetupInProgress = false

  // Custom guardrails for legacy 16-character OTP secrets (10 bytes when decoded)
  private legacyOtpGuardrails = createGuardrails({
    MIN_SECRET_BYTES: 10, // allow legacy 16-character Base32 secrets from otplib v12
    MAX_SECRET_BYTES: 64,
  })

  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(JsonFileStoreService) private readonly jsonStore: JsonFileStoreService,
    @Inject(Logger) private readonly logger: Logger,
  ) {
    this.checkAuthFile()
  }

  /**
   * Authenticate a user with their credentials
   * @param username
   * @param password
   * @param otp
   * @param clientId - optional client identifier (e.g. source address) mixed into
   * the throttle key alongside the username
   */
  async authenticate(username: string, password: string, otp?: string, clientId?: string): Promise<any> {
    const throttleKey = `${(username || '').toLowerCase()}|${clientId || ''}`

    // Reject before doing any work once the failure threshold is reached, so
    // password and 2FA guessing cannot run unbounded.
    if ((this.loginFailureCache.get<number>(throttleKey) || 0) >= MAX_LOGIN_FAILURES) {
      this.logger.warn(`Too many failed login attempts for '${username}' - temporarily locked out.`)
      throw new HttpException('Too many failed attempts. Please wait a few minutes and try again.', 429)
    }

    try {
      const user = await this.findByUsername(username)

      if (!user) {
        throw new ForbiddenException()
      }

      await this.checkPassword(user, password)

      if (user.otpActive && !otp) {
        throw new HttpException('2FA Code Required', 412)
      }

      if (user.otpActive && !await this.verifyOtpToken(user, otp)) {
        throw new HttpException('2FA Code Invalid', 412)
      }

      // Credentials (and OTP, if enabled) are valid: upgrade a legacy weak
      // password hash to the current work factor before returning.
      await this.upgradePasswordHashIfNeeded(user, password)

      // Success clears the failure count for this key.
      this.loginFailureCache.del(throttleKey)

      if (user) {
        return {
          username: user.username,
          name: user.name,
          admin: user.admin,
          instanceId: this.configService.instanceId,
          sessionVersion: user.sessionVersion ?? 0,
          otpLegacySecret: user.otpLegacySecret || false,
        }
      }
    } catch (e) {
      // "2FA Code Required" is a prompt for more input, not a failed attempt,
      // so it must not count towards the lockout.
      const is2faPrompt = e instanceof HttpException && e.getStatus() === 412 && e.message === '2FA Code Required'
      if (!is2faPrompt) {
        const failures = (this.loginFailureCache.get<number>(throttleKey) || 0) + 1
        this.loginFailureCache.set(throttleKey, failures)
      }

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
   * @param clientId - optional client identifier (e.g. source address) for login throttling
   */
  async signIn(username: string, password: string, otp?: string, clientId?: string): Promise<any> {
    const user = await this.authenticate(username, password, otp, clientId)
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
    // Verify against the strength this record was hashed at. Legacy records
    // carry no count and were hashed at 1,000 iterations.
    const iterations = user.passwordIterations ?? LEGACY_PBKDF2_ITERATIONS
    const passwordAttemptHash = await this.hashPassword(password, user.salt, iterations)
    const passwordAttemptHashBuff = Buffer.from(passwordAttemptHash, 'hex')
    const knownPasswordHashBuff = Buffer.from(user.hashedPassword, 'hex')

    if (timingSafeEqual(passwordAttemptHashBuff, knownPasswordHashBuff)) {
      return user
    } else {
      throw new ForbiddenException()
    }
  }

  /**
   * Re-hash a user's password at the current work factor if it is stored at a
   * weaker one. Called after a successful login (outside the auth-file lock) so
   * legacy 1,000-iteration hashes are upgraded transparently the next time the
   * owner signs in.
   */
  private async upgradePasswordHashIfNeeded(user: UserDto, password: string) {
    const current = user.passwordIterations ?? LEGACY_PBKDF2_ITERATIONS
    if (current >= PBKDF2_ITERATIONS) {
      return
    }
    try {
      const salt = await this.genSalt()
      const hashedPassword = await this.hashPassword(password, salt, PBKDF2_ITERATIONS)
      await this.withAuthFile((authfile) => {
        const stored = authfile.find(x => x.username === user.username)
        if (stored) {
          stored.salt = salt
          stored.hashedPassword = hashedPassword
          stored.passwordIterations = PBKDF2_ITERATIONS
        }
      })
      this.logger.log(`Upgraded stored password hash strength for ${user.username}.`)
    } catch (e) {
      // Never fail a valid login because the upgrade write failed; it will be
      // retried on the next login.
      this.logger.warn(`Could not upgrade password hash for ${user.username}: ${e.message}`)
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
      sessionVersion: user.sessionVersion ?? 0,
      otpLegacySecret: user.otpLegacySecret || false,
    })

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: this.configService.ui.sessionTimeout,
    }
  }

  /**
   * Refresh an existing token to extend the session
   * @param user - the current user payload from the JWT
   * @param reason - optional client reason for distinct log lines (allowlisted)
   */
  async refreshToken(user: any, reason?: string): Promise<any> {
    // Validate that the user still exists and has the same permissions
    const currentUser = await this.findByUsername(user.username)
    if (!currentUser) {
      throw new UnauthorizedException('User no longer exists')
    }

    this.logger.log(this.refreshTokenLogMessage(user.username, reason))

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
      // Take the version from the stored record, not the old token, so a
      // refresh cannot carry a stale credential version forward.
      sessionVersion: currentUser.sessionVersion ?? 0,
      otpLegacySecret: currentUser.otpLegacySecret || false,
    })

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: this.configService.ui.sessionTimeout,
    }
  }

  /**
   * Distinct log lines per refresh caller so admin checks and inactivity
   * extension are not identical (and look like accidental duplicates).
   */
  private refreshTokenLogMessage(username: string, reason?: string): string {
    switch (reason) {
      case 'admin-guard':
        return `Verifying admin session for ${username} (admin-guard token refresh).`
      case 'session-extension':
        return `Extending session for ${username} (inactivity-based token refresh).`
      case 'profile-update':
        return `Refreshing token for ${username} after profile/auth change.`
      default:
        return `Request received to refresh token for ${username}.`
    }
  }

  /**
   * Validate a decoded, verified JWT payload against the user's current state.
   *
   * A valid signature alone is not enough: the payload is a snapshot from when
   * the token was minted, so without this check a deleted user, a demoted
   * administrator, or a user whose password was just changed kept full access
   * until the token expired (eight hours by default).
   *
   * @param payload - the decoded, verified jwt payload
   * @returns the payload if it still matches the stored user, otherwise null
   */
  async validateUser(payload: any): Promise<any> {
    // The setup-wizard token deliberately has no user record behind it. It is
    // already constrained to the live wizard by the instanceId checks in
    // JwtStrategy and the websocket guards.
    if (payload?.username === 'setup-wizard' && this.configService.setupWizardComplete === false) {
      return payload
    }

    const user = await this.findCurrentUser(payload?.username)

    // Deleted (or renamed) since the token was issued
    if (!user) {
      return null
    }

    // Role changed since the token was issued
    if (!!user.admin !== !!payload.admin) {
      return null
    }

    // Credentials changed since the token was issued (password, OTP, ...)
    if ((user.sessionVersion ?? 0) !== (payload.sessionVersion ?? 0)) {
      return null
    }

    return payload
  }

  /**
   * Look up a user for token validation. This runs on every authenticated
   * request, so the auth file is cached briefly rather than read each time;
   * revocation therefore takes effect within USER_CACHE_TTL_SECONDS.
   */
  private async findCurrentUser(username?: string): Promise<UserDto | undefined> {
    if (!username) {
      return undefined
    }
    let users = this.userCache.get<UserDto[]>('users')
    if (!users) {
      users = await this.getUsers()
      this.userCache.set('users', users)
    }
    return users.find(x => x.username === username)
  }

  /**
   * Drop the cached auth file. Called after any write that changes who a user
   * is or what they may do, so revocation is immediate rather than waiting for
   * the cache to expire.
   */
  private invalidateUserCache() {
    this.userCache.del('users')
  }

  /**
   * Hash a password
   * @param password
   * @param salt
   */
  private async hashPassword(password: string, salt: string, iterations: number = PBKDF2_ITERATIONS): Promise<string> {
    return new Promise((resolve, reject) => {
      pbkdf2(password, salt, iterations, 64, 'sha512', (err, derivedKey) => {
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

    // Reserve the setup synchronously, before the first `await` below.
    // `setupWizardComplete` is only flipped true after both async writes
    // finish, so without this reservation two requests arriving together
    // could both pass the check above and each create an administrator during
    // first-run onboarding. The flag is released in `finally`, so a failed
    // attempt (e.g. a write error) still allows a genuine retry.
    if (this.firstUserSetupInProgress) {
      throw new ConflictException('First user setup is already in progress.')
    }
    this.firstUserSetupInProgress = true

    try {
      // First user must be admin
      user.admin = true

      // Start with an empty auth file; addUser() below acquires the same
      // lock to push the first user, so both writes serialise correctly.
      await this.jsonStore.write<UserDto[]>(this.configService.authPath, [], { spaces: 4 })

      const createdUser = await this.addUser(user)

      this.configService.setupWizardComplete = true

      return createdUser
    } finally {
      this.firstUserSetupInProgress = false
    }
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
      if (!authfile.some(x => x.admin === true)) {
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
      otpLegacySecret: user.otpLegacySecret || false,
    }
  }

  /**
   * Returns all the users
   * @param strip - if true, remove the users salt and hashed password from the response
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
   * Run a read-modify-write transaction against auth.json under the
   * shared per-path mutex. The callback receives the parsed users
   * array (fresh from disk under the lock), mutates it in place, and
   * may optionally return a side value for the outer caller (e.g. the
   * newly-added user). The mutated array is then atomically persisted
   * via write-temp/fsync/rename.
   *
   * Closes the long-standing race where two concurrent /users requests
   * each read the same baseline (`Math.max(...ids) + 1` produced
   * duplicate IDs; the second write wiped the first add/delete).
   */
  private async withAuthFile<R>(
    mutator: (users: UserDto[]) => R | Promise<R>,
  ): Promise<R> {
    let result: R | undefined
    await this.jsonStore.mutate<UserDto[]>(
      this.configService.authPath,
      async (current) => {
        const users = current ?? []
        result = await mutator(users)
        return users
      },
      { spaces: 4 },
    )
    // Every write to the auth file goes through here, so this is the one place
    // that has to drop the token-validation cache. Without it a deletion or
    // demotion would not take effect until the cache expired.
    this.invalidateUserCache()
    return result as R
  }

  /**
   * Add a new user
   * @param user
   */
  async addUser(user: UserDto) {
    // Salt + password hashing are computed *outside* the auth.json
    // lock so a slow PBKDF2 doesn't block other callers waiting on
    // the file. The duplicate-username check + id derivation + push
    // run inside the lock, against a fresh read.
    const salt = await this.genSalt()
    const hashedPassword = await this.hashPassword(user.password, salt)

    return this.withAuthFile((authfile) => {
      if (authfile.some(x => x.username.toLowerCase() === user.username.toLowerCase())) {
        throw new ConflictException(`User with username '${user.username}' already exists.`)
      }
      const newUser: UserDto = {
        id: authfile.length ? Math.max(...authfile.map(x => x.id)) + 1 : 1,
        username: user.username,
        name: user.name,
        hashedPassword,
        salt,
        passwordIterations: PBKDF2_ITERATIONS,
        sessionVersion: 0,
        admin: user.admin,
      }
      authfile.push(newUser)
      this.logger.warn(`Added new user: ${user.username}.`)
      return this.desensitiseUserProfile(newUser)
    })
  }

  /**
   * Remove a user
   * @param id
   */
  async deleteUser(id: number) {
    await this.withAuthFile((authfile) => {
      const index = authfile.findIndex(x => x.id === id)
      if (index < 0) {
        throw new BadRequestException('User Not Found')
      }
      // Prevent deleting the only admin user
      if (authfile[index].admin && authfile.filter(x => x.admin === true).length < 2) {
        throw new BadRequestException('Cannot delete only admin user')
      }
      authfile.splice(index, 1)
      this.logger.warn(`Deleted user with ID ${id}.`)
    })
  }

  /**
   * Updates a user
   * @param id
   * @param update
   */
  async updateUser(id: number, update: UserDto) {
    // Pre-compute the new salt + hash outside the lock so PBKDF2 isn't
    // serialised against unrelated auth-file mutations.
    let newSalt: string | undefined
    let newHashedPassword: string | undefined
    if (update.password) {
      newSalt = await this.genSalt()
      newHashedPassword = await this.hashPassword(update.password, newSalt)
    }

    return this.withAuthFile((authfile) => {
      const user = authfile.find(x => x.id === id)
      if (!user) {
        throw new BadRequestException('User Not Found')
      }
      if (user.username !== update.username) {
        if (authfile.some(x => x.username.toLowerCase() === update.username.toLowerCase())) {
          throw new ConflictException(`User with username '${update.username}' already exists.`)
        }
        this.logger.log(`Updated user: changed username from ${user.username} to ${update.username}.`)
        user.username = update.username
      }
      user.name = update.name || user.name
      const adminChanged = update.admin !== undefined && !!update.admin !== !!user.admin
      user.admin = (update.admin === undefined) ? user.admin : update.admin
      if (newHashedPassword && newSalt) {
        user.hashedPassword = newHashedPassword
        user.salt = newSalt
        user.passwordIterations = PBKDF2_ITERATIONS
      }
      // Changing the password or the admin role must invalidate tokens already
      // issued to this user, which carry the old values in their payload.
      if (newHashedPassword || adminChanged) {
        user.sessionVersion = (user.sessionVersion ?? 0) + 1
      }
      this.logger.log(`Updated user: ${user.username}.`)
      return this.desensitiseUserProfile(user)
    })
  }

  /**
   * Change a users own password
   */
  async updateOwnPassword(username: string, currentPassword: string, newPassword: string) {
    // The current-password check has to run against the on-disk value
    // (otherwise a stale-but-just-changed password would be accepted).
    // Do it inside the lock against a fresh read; the new salt and
    // hash are computed inside too so the validate→update window
    // can't be interleaved by another /password call for the same
    // user.
    const newSalt = await this.genSalt()
    const newHashedPassword = await this.hashPassword(newPassword, newSalt)

    return this.withAuthFile(async (authfile) => {
      const user = authfile.find(x => x.username === username)
      if (!user) {
        throw new NotFoundException('User not found.')
      }
      // This will throw an error if the password is wrong
      await this.checkPassword(user, currentPassword)
      user.hashedPassword = newHashedPassword
      user.salt = newSalt
      user.passwordIterations = PBKDF2_ITERATIONS
      // Invalidate tokens issued against the old password.
      user.sessionVersion = (user.sessionVersion ?? 0) + 1
      return this.desensitiseUserProfile(user)
    })
  }

  /**
   * Generate an OTP secret for a user
   */
  async setupOtp(username: string) {
    return this.withAuthFile((authfile) => {
      const user = authfile.find(x => x.username === username)
      if (!user) {
        throw new NotFoundException('User not found.')
      }
      if (user.otpActive) {
        throw new ForbiddenException('2FA has already been activated.')
      }
      user.otpSecret = generateSecret()
      const appName = `Homebridge UI (${this.configService.instanceId.slice(0, 7)})`
      return {
        timestamp: new Date(),
        otpauth: generateURI({
          issuer: appName,
          label: user.username,
          secret: user.otpSecret,
        }),
      }
    })
  }

  /**
   * Activates the OTP requirement for a user after verifying the otp code
   */
  async activateOtp(username: string, code: string) {
    return this.withAuthFile(async (authfile) => {
      const user = authfile.find(x => x.username === username)
      if (!user) {
        throw new NotFoundException('User not found.')
      }
      if (!user.otpSecret) {
        throw new BadRequestException('2FA has not been setup.')
      }

      let valid = false
      try {
        // Try with v13 (for 32-character secrets)
        const result = await verify({
          token: code,
          secret: user.otpSecret,
          epochTolerance: 30,
        })
        valid = result.valid
      } catch (error: unknown) {
        // If SecretTooShortError, use custom guardrails (shouldn't happen for new setups, but handle it)
        if (error instanceof Error && error.name === 'SecretTooShortError' && user.otpSecret.length === 16) {
          this.logger.warn(`${user.username} is attempting to activate a legacy 16-character OTP secret.`)

          const result = await verify({
            token: code,
            secret: user.otpSecret,
            epochTolerance: 30,
            guardrails: this.legacyOtpGuardrails,
          })
          valid = result.valid

          if (valid) {
            user.otpLegacySecret = true
          }
        } else {
          throw error
        }
      }

      if (!valid) {
        throw new BadRequestException('2FA code is not valid.')
      }
      user.otpActive = true
      // Turning 2FA on invalidates sessions established before it was required.
      user.sessionVersion = (user.sessionVersion ?? 0) + 1
      this.logger.warn(`Activated 2FA for ${user.username}.`)
      return this.desensitiseUserProfile(user)
    })
  }

  /**
   * Deactivates the OTP requirement for a user after verifying their password
   */
  async deactivateOtp(username: string, password: string) {
    return this.withAuthFile(async (authfile) => {
      const user = authfile.find(x => x.username === username)
      if (!user) {
        throw new NotFoundException('User not found.')
      }
      // This will throw an error if the password is not valid
      await this.checkPassword(user, password)
      user.otpActive = false
      delete user.otpSecret
      delete user.otpLegacySecret
      user.sessionVersion = (user.sessionVersion ?? 0) + 1
      this.logger.warn(`Deactivated 2FA for ${username}.`)
      return this.desensitiseUserProfile(user)
    })
  }

  /**
   * Verify an OTP token for a user and prevent it being used more than once
   */
  async verifyOtpToken(user: UserDto, otp: string): Promise<boolean> {
    const otpCacheKey = user.username + otp

    if (this.otpUsageCache.get(otpCacheKey)) {
      this.logger.warn(`${user.username} attempted to reuse one-time-password.`)
      return false
    }

    // Reserve the slot BEFORE awaiting verify(). Otherwise two parallel
    // requests with the same captured code would both pass the cache
    // check, both call verify(), and both succeed — defeating the
    // single-use protection. The reservation is rolled back if the code
    // turns out to be invalid so the user can correct a typo and retry.
    this.otpUsageCache.set(otpCacheKey, 'pending')

    try {
      // Try with v13 (for 32-character secrets)
      const { valid } = await verify({
        token: otp,
        secret: user.otpSecret,
        epochTolerance: 30,
      })

      if (valid) {
        this.otpUsageCache.set(otpCacheKey, 'true')
        return true
      }
    } catch (error: unknown) {
      // If SecretTooShortError, this is a legacy 16-character secret from otplib v12
      if (error instanceof Error && error.name === 'SecretTooShortError' && user.otpSecret.length === 16) {
        this.logger.warn(`${user.username} is using a legacy 16-character OTP secret. They should re-setup 2FA for better security.`)

        // Use custom guardrails to allow legacy 10-byte (16-character) secrets
        const { valid } = await verify({
          token: otp,
          secret: user.otpSecret,
          epochTolerance: 30,
          guardrails: this.legacyOtpGuardrails,
        })

        if (valid) {
          this.otpUsageCache.set(otpCacheKey, 'true')

          // Set the flag on the user object immediately so it's included in the JWT
          user.otpLegacySecret = true

          // Persist the flag to the auth file (async, don't block login)
          this.markUserAsLegacyOtp(user.username).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : 'Unknown error'
            this.logger.error(`Failed to mark user ${user.username} as having legacy OTP: ${message}`)
          })

          return true
        }
      } else {
        // Re-throw if it's a different error — but first roll back the
        // reservation so a transient failure doesn't lock the user out.
        this.otpUsageCache.del(otpCacheKey)
        throw error
      }
    }

    // verify() returned !valid. Roll back the reservation so a typed
    // typo doesn't burn the code for the user's next attempt.
    this.otpUsageCache.del(otpCacheKey)
    return false
  }

  /**
   * Mark a user as having a legacy OTP secret
   */
  private async markUserAsLegacyOtp(username: string) {
    await this.jsonStore.mutate<UserDto[]>(
      this.configService.authPath,
      (current) => {
        const authfile = current ?? []
        const user = authfile.find(x => x.username === username)
        if (!user || user.otpLegacySecret) {
          // No-op: nothing to update, skip the write.
          return null
        }
        user.otpLegacySecret = true
        this.logger.warn(`Marked ${username} as having legacy OTP secret.`)
        return authfile
      },
      { spaces: 4 },
    )
  }
}
