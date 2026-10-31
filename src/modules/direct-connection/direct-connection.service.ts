import type { ChildProcess } from 'node:child_process'
import type { IncomingMessage } from 'node:http'

import type { DirectConnectionProtection, DirectConnectionState, DirectConnectionStatusDto, DirectConnectionVariant } from './direct-connection.dto.js'
import type { GatewayDenial } from './tunnel-gateway.js'

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { chmod, rename, stat, writeFile } from 'node:fs/promises'
import { isIPv6 } from 'node:net'
import { join, resolve } from 'node:path'
import process from 'node:process'

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common'
import { ensureDir, pathExists, remove } from 'fs-extra/esm'

import { ConfigService } from '../../core/config/config.service.js'
import { JsonFileStoreService } from '../../core/fs/json-file-store.service.js'
import { Logger } from '../../core/logger/logger.service.js'
import { CloudflareAccessVerifier, normaliseTeamDomain } from './cloudflare-access.js'
import { ensureCloudflaredBinary, isCloudflaredSupported } from './cloudflared-binary.js'
import { TunnelGateway } from './tunnel-gateway.js'

interface DirectConnectionSettings {
  enabled: boolean
  variant: DirectConnectionVariant
  hostname: string
  tunnelId: string | null
  accessTeamDomain: string
  accessAudience: string
}

export interface CloudflaredResult {
  code: number | null
  stdout: string
  stderr: string
}

const LOGIN_URL_TIMEOUT_MS = 30_000
const LOGIN_MAX_DURATION_MS = 15 * 60_000
const COMMAND_TIMEOUT_MS = 60_000
const STOP_GRACE_MS = 5_000
const RESTART_BASE_DELAY_MS = 5_000
const RESTART_MAX_DELAY_MS = 5 * 60_000
// How often a running tunnel re-checks that it is still safe to serve
const WATCH_INTERVAL_MS = 5_000
// The Cloudflare account certificate is only needed to create the tunnel and
// its DNS record. It is removed once that is done, and in any case once it is
// this old, so it does not sit next to Homebridge (and its plugins) for long.
const CERT_MAX_AGE_MS = 15 * 60_000

const LOGIN_URL_REGEX = /https:\/\/dash\.cloudflare\.com\/argotunnel\?\S+/
const QUICK_URL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/**
 * Exposes the UI at a public address through a Cloudflare Tunnel.
 *
 * Everything cloudflared reads or writes - the binary, the account
 * certificate, tunnel credentials and the ingress config - lives under
 * `<storage>/.uix-direct-connection`. cloudflared is run with HOME pointed
 * there, so a cloudflared install the user manages themselves (and its
 * ~/.cloudflared) is never read, overwritten or logged out.
 *
 * Security model:
 * - cloudflared never talks to the UI directly. It is pointed at a loopback
 *   TunnelGateway, which refuses everything while the UI login is off (and
 *   turns the tunnel off), enforces Cloudflare Access when configured, and
 *   marks requests so the UI uses Secure cookies and the visitor's real
 *   address for login throttling.
 * - The account-wide cert.pem from `tunnel login` is deleted as soon as the
 *   tunnel and DNS record exist (or after CERT_MAX_AGE_MS). Only the
 *   tunnel's own credentials file is kept, which can run that one tunnel and
 *   nothing else in the account.
 * - The cloudflared binary is checked against a pinned SHA-256 before it runs.
 */
@Injectable()
export class DirectConnectionService implements OnApplicationBootstrap, OnModuleDestroy {
  public readonly baseDir: string
  private readonly settingsPath: string
  private readonly binDir: string
  private readonly certPath: string
  private readonly credentialsDir: string
  private readonly namedConfigPath: string
  private readonly quickConfigPath: string

  private settings: DirectConnectionSettings | null = null

  private tunnelProcess: ChildProcess | null = null
  private desiredRunning = false
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private restartAttempts = 0
  private resumeAttempts = 0
  private connections = new Set<string>()
  private state: DirectConnectionState = 'stopped'
  private publicUrl: string | null = null
  private lastError: string | null = null
  private lastCloudflaredError: string | null = null

  private loginProcess: ChildProcess | null = null
  private loginUrl: string | null = null

  private queue: Promise<unknown> = Promise.resolve()

  private readonly gateway: TunnelGateway
  private accessVerifier: CloudflareAccessVerifier | null = null
  private watchTimer: ReturnType<typeof setInterval> | null = null
  private shuttingDownUnsafe = false

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(JsonFileStoreService) private readonly jsonStore: JsonFileStoreService,
    @Inject(Logger) private readonly logger: Logger,
  ) {
    this.baseDir = resolve(this.configService.storagePath, '.uix-direct-connection')
    this.settingsPath = join(this.baseDir, 'settings.json')
    this.binDir = join(this.baseDir, 'bin')
    this.certPath = join(this.baseDir, '.cloudflared', 'cert.pem')
    this.credentialsDir = join(this.baseDir, 'credentials')
    this.namedConfigPath = join(this.baseDir, 'tunnel.yml')
    this.quickConfigPath = join(this.baseDir, 'quick.yml')

    this.gateway = new TunnelGateway({
      origin: () => this.originService(),
      check: req => this.checkTunnelRequest(req),
      onError: message => this.logger.debug(message),
    })
  }

  async onApplicationBootstrap() {
    await this.pruneCertificate()
    const settings = await this.loadSettings()
    if (!settings.enabled) {
      return
    }

    // Don't hold up the UI starting while the tunnel comes up
    void this.exclusive(() => this.resumeTunnel())
  }

  /**
   * Bring an enabled tunnel back after the UI starts. A named tunnel that is
   * already provisioned is launched straight from its local credentials, so a
   * restart without internet access (or with the Cloudflare API down) still
   * comes back once the network does. Anything else is retried with backoff.
   */
  private async resumeTunnel() {
    const settings = await this.loadSettings()
    if (!settings.enabled) {
      return
    }

    try {
      await this.startTunnel()
      this.resumeAttempts = 0
    } catch (e) {
      this.logger.error(`Direct Connection: could not start the tunnel: ${e.message}`)
      if (this.blockedReason() || !isCloudflaredSupported() || !(await this.canStartNamedTunnel(settings))) {
        // Retrying cannot help until the user changes something
        return
      }
      const delay = Math.min(RESTART_BASE_DELAY_MS * 2 ** this.resumeAttempts, RESTART_MAX_DELAY_MS)
      this.resumeAttempts++
      this.logger.warn(`Direct Connection: retrying in ${Math.round(delay / 1000)}s.`)
      this.clearRestartTimer()
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null
        void this.exclusive(() => this.resumeTunnel())
      }, delay)
    }
  }

  async onModuleDestroy() {
    this.desiredRunning = false
    this.clearRestartTimer()
    this.stopWatching()
    this.stopLogin()
    await this.stopTunnelProcess()
    await this.gateway.stop()
  }

  /**
   * Current settings and live tunnel state.
   */
  async getStatus(): Promise<DirectConnectionStatusDto> {
    await this.pruneCertificate()
    const settings = await this.loadSettings()
    return {
      supported: isCloudflaredSupported(),
      blockedReason: this.blockedReason(),
      enabled: settings.enabled,
      variant: settings.variant,
      hostname: settings.hostname,
      tunnelId: settings.tunnelId,
      provisioned: await this.isProvisioned(settings),
      protection: await this.protection(settings),
      accessTeamDomain: settings.accessTeamDomain,
      accessAudience: settings.accessAudience,
      loggedIn: await pathExists(this.certPath),
      loginInProgress: Boolean(this.loginProcess),
      loginUrl: this.loginUrl,
      state: this.state,
      publicUrl: this.state === 'stopped'
        ? null
        : this.publicUrl,
      lastError: this.lastError,
    }
  }

  /**
   * Change the tunnel type or hostname. Only allowed while disconnected, so a
   * running tunnel never silently serves a different hostname.
   */
  async updateSettings(
    variant: DirectConnectionVariant,
    hostname?: string,
    access?: { teamDomain?: string, audience?: string },
  ): Promise<DirectConnectionStatusDto> {
    await this.exclusive(async () => {
      const settings = await this.loadSettings()
      if (settings.enabled) {
        throw new ConflictException('Disconnect before changing the Direct Connection settings.')
      }

      const nextHostname = hostname === undefined
        ? settings.hostname
        : hostname.trim().toLowerCase()
      const accessTeamDomain = access?.teamDomain === undefined
        ? settings.accessTeamDomain
        : normaliseTeamDomain(access.teamDomain)
      const accessAudience = access?.audience === undefined
        ? settings.accessAudience
        : access.audience.trim().toLowerCase()
      // Signing keys are fetched from this domain, so only accept Cloudflare's
      if (accessTeamDomain && !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(accessTeamDomain)) {
        throw new BadRequestException('The Cloudflare Access team domain must look like myteam.cloudflareaccess.com.')
      }
      if (Boolean(accessTeamDomain) !== Boolean(accessAudience)) {
        throw new BadRequestException('Enter both the Cloudflare Access team domain and the application audience (AUD) tag, or leave both empty.')
      }
      await this.saveSettings({
        ...settings,
        variant,
        hostname: nextHostname,
        accessTeamDomain,
        accessAudience,
        // A different hostname gets its own tunnel
        tunnelId: nextHostname === settings.hostname
          ? settings.tunnelId
          : null,
      })
      this.lastError = null
    })
    return this.getStatus()
  }

  /**
   * Turn the tunnel on and remember it across restarts. Setup problems
   * (not signed in, DNS conflicts) are returned as errors; connecting to the
   * Cloudflare edge happens in the background and is reported by getStatus().
   */
  async connect(): Promise<DirectConnectionStatusDto> {
    await this.exclusive(async () => {
      const settings = await this.loadSettings()
      this.assertCanExpose()

      if (settings.variant === 'named') {
        if (!settings.hostname) {
          throw new BadRequestException('Enter the hostname to publish the UI at.')
        }
        if (!(await this.canStartNamedTunnel(settings))) {
          throw new BadRequestException('Sign in with Cloudflare before connecting a named tunnel.')
        }
      }

      await this.saveSettings({ ...settings, enabled: true })
      try {
        await this.startTunnel()
      } catch (e) {
        await this.saveSettings({
          ...(await this.loadSettings()),
          enabled: false,
        })
        throw new BadRequestException(e.message)
      }
    })
    return this.getStatus()
  }

  /**
   * Stop the tunnel and keep it off across restarts. The tunnel and DNS
   * record stay in the Cloudflare account, so reconnecting is quick.
   */
  async disconnect(): Promise<DirectConnectionStatusDto> {
    await this.exclusive(async () => {
      await this.saveSettings({
        ...(await this.loadSettings()),
        enabled: false,
      })
      await this.stopTunnel()
      this.lastError = null
    })
    return this.getStatus()
  }

  /**
   * Begin `cloudflared tunnel login` and return the Cloudflare authorisation
   * URL. cloudflared keeps polling in the background and writes the
   * certificate once the user approves; getStatus() reports loggedIn then.
   */
  async startLogin(): Promise<DirectConnectionStatusDto> {
    await this.exclusive(async () => {
      this.assertCanExpose()

      if (await pathExists(this.certPath) || this.loginProcess) {
        return
      }

      const bin = await this.getBinary()
      await this.prepareBaseDir()

      const proc = this.spawnCloudflared(bin, ['tunnel', 'login'])
      this.loginProcess = proc
      this.loginUrl = null

      const killTimer = setTimeout(() => proc.kill(), LOGIN_MAX_DURATION_MS)
      proc.once('close', async () => {
        clearTimeout(killTimer)
        if (this.loginProcess === proc) {
          this.loginProcess = null
          this.loginUrl = null
        }
        if (await pathExists(this.certPath)) {
          await chmod(this.certPath, 0o600).catch(() => {})
          this.logger.log('Direct Connection: signed in to Cloudflare. The account certificate is kept only until the tunnel is created.')
        }
      })

      const url = await new Promise<string | null>((resolveUrl) => {
        let buffer = ''
        const timer = setTimeout(resolveUrl, LOGIN_URL_TIMEOUT_MS, null)
        const onData = (data: Buffer) => {
          buffer += data.toString()
          const match = buffer.match(LOGIN_URL_REGEX)
          if (match) {
            clearTimeout(timer)
            resolveUrl(match[0])
          }
        }
        proc.stdout?.on('data', onData)
        proc.stderr?.on('data', onData)
        const onEnd = () => {
          clearTimeout(timer)
          resolveUrl(null)
        }
        proc.once('close', onEnd)
        proc.once('error', onEnd)
      })

      if (!url) {
        this.stopLogin()
        throw new BadRequestException('cloudflared did not return a Cloudflare sign-in link. Check the Homebridge UI log for details.')
      }

      this.loginUrl = url
    })
    return this.getStatus()
  }

  /**
   * Stop the tunnel and forget the Cloudflare account on this server. The
   * tunnel and DNS record are left in the Cloudflare account; they can be
   * removed from the Cloudflare dashboard.
   */
  async logout(): Promise<DirectConnectionStatusDto> {
    await this.exclusive(async () => {
      const settings = await this.loadSettings()
      await this.saveSettings({ ...settings, enabled: false, tunnelId: null })
      await this.stopTunnel()
      this.stopLogin()
      await remove(this.certPath)
      await remove(this.credentialsDir)
      await remove(this.namedConfigPath)
      this.lastError = null
      this.logger.log('Direct Connection: signed out of Cloudflare.')
    })
    return this.getStatus()
  }

  /**
   * Why the UI must not be published, if anything. Without a login page
   * anyone who finds the address would get full control of Homebridge.
   */
  private blockedReason(): DirectConnectionStatusDto['blockedReason'] {
    if (this.configService.ui.auth === 'none') {
      return 'auth-disabled'
    }
    return null
  }

  private assertCanExpose() {
    if (this.blockedReason() === 'auth-disabled') {
      throw new BadRequestException('Direct Connection needs the UI login enabled. Turn authentication back on first.')
    }
    if (!isCloudflaredSupported()) {
      throw new BadRequestException(`Direct Connection is not available on ${process.platform}/${process.arch}.`)
    }
  }

  /**
   * What, apart from the UI login, stands between the internet and the UI.
   */
  private async protection(settings: DirectConnectionSettings): Promise<DirectConnectionProtection> {
    if (settings.accessTeamDomain && settings.accessAudience) {
      return 'cloudflare-access'
    }
    try {
      const users = await this.jsonStore.read<{ admin?: boolean, otpActive?: boolean }[]>(this.configService.authPath)
      const admins = Array.isArray(users)
        ? users.filter(u => u?.admin)
        : []
      if (admins.length && admins.every(u => u.otpActive)) {
        return 'two-factor'
      }
    } catch {
      // Treated as unprotected
    }
    return 'password-only'
  }

  /**
   * Called by the gateway for every tunneled request and WebSocket upgrade,
   * before it reaches the UI.
   */
  private async checkTunnelRequest(req: IncomingMessage): Promise<GatewayDenial | null> {
    if (!this.desiredRunning || this.blockedReason()) {
      // The UI login was turned off while the tunnel was up: stop serving
      // straight away rather than wait for the next watch tick
      // (after this request's refusal is on its way)
      setImmediate(() => void this.shutdownUnsafe())
      return { status: 503, message: 'Direct Connection is not available' }
    }

    const verifier = this.accessVerifier
    if (verifier) {
      const token = req.headers['cf-access-jwt-assertion']
      if (!(await verifier.verify(Array.isArray(token)
        ? token[0]
        : token))) {
        return { status: 403, message: 'Cloudflare Access authorisation required' }
      }
    }
    return null
  }

  /**
   * Turn the tunnel off because it is no longer safe to serve (the UI login
   * was turned off). It stays off until an administrator connects again.
   */
  private async shutdownUnsafe() {
    if (this.shuttingDownUnsafe) {
      return
    }
    this.shuttingDownUnsafe = true
    // Cut existing connections now; the queued stop below may wait behind
    // another operation
    this.gateway.dropConnections()
    try {
      await this.exclusive(async () => {
        const reason = this.blockedReason()
        if (!reason || !this.desiredRunning) {
          return
        }
        this.logger.error('Direct Connection: the UI login was turned off, so the tunnel has been stopped. Turn authentication back on and connect again.')
        await this.saveSettings({
          ...(await this.loadSettings()),
          enabled: false,
        })
        await this.stopTunnel()
        this.state = 'error'
        this.lastError = 'Stopped because the UI login was turned off.'
      })
    } finally {
      this.shuttingDownUnsafe = false
    }
  }

  private startWatching() {
    if (!this.watchTimer) {
      this.watchTimer = setInterval(() => {
        if (this.desiredRunning && this.blockedReason()) {
          void this.shutdownUnsafe()
        }
      }, WATCH_INTERVAL_MS)
      this.watchTimer.unref?.()
    }
  }

  private stopWatching() {
    if (this.watchTimer) {
      clearInterval(this.watchTimer)
      this.watchTimer = null
    }
  }

  /**
   * Whether the named tunnel for the current hostname already exists and we
   * hold its credentials, so it can run without the account certificate.
   */
  private async isProvisioned(settings: DirectConnectionSettings): Promise<boolean> {
    return Boolean(settings.tunnelId && settings.hostname && await pathExists(this.credentialsPath(settings.tunnelId)))
  }

  private async canStartNamedTunnel(settings: DirectConnectionSettings): Promise<boolean> {
    if (settings.variant !== 'named') {
      return true
    }
    return await this.isProvisioned(settings) || await pathExists(this.certPath)
  }

  /**
   * Remove the account certificate once it is older than CERT_MAX_AGE_MS.
   */
  private async pruneCertificate() {
    try {
      const info = await stat(this.certPath)
      if (Date.now() - info.mtimeMs > CERT_MAX_AGE_MS && !this.loginProcess) {
        await remove(this.certPath)
        this.logger.log('Direct Connection: removed an unused Cloudflare account certificate.')
      }
    } catch {
      // No certificate
    }
  }

  private async startTunnel() {
    this.assertCanExpose()
    const settings = await this.loadSettings()

    await this.stopTunnelProcess()
    this.clearRestartTimer()
    this.desiredRunning = true
    this.restartAttempts = 0
    this.lastError = null
    this.publicUrl = null
    this.state = 'starting'

    try {
      const bin = await this.getBinary()
      await this.prepareBaseDir()

      this.accessVerifier = settings.accessTeamDomain && settings.accessAudience
        ? new CloudflareAccessVerifier(settings.accessTeamDomain, settings.accessAudience)
        : null
      await this.gateway.start()

      if (settings.variant === 'named') {
        let tunnelId = settings.tunnelId
        if (await this.isProvisioned(settings)) {
          // Already created: run from the tunnel's own credentials, without
          // the account certificate or the Cloudflare API. This is also what
          // lets a restart come back while offline.
          await this.writeNamedConfig(tunnelId, settings.hostname)
        } else {
          if (!(await pathExists(this.certPath))) {
            throw new Error('Sign in with Cloudflare before connecting a named tunnel.')
          }
          tunnelId = await this.provisionNamedTunnel(bin, settings)
          await this.saveSettings({
            ...(await this.loadSettings()),
            tunnelId,
          })
          // The certificate can manage every tunnel and DNS record in the
          // zone. It is not needed to run this tunnel, so don't keep it.
          await remove(this.certPath)
          this.logger.log('Direct Connection: tunnel created; removed the Cloudflare account certificate from this server.')
        }
        this.publicUrl = `https://${settings.hostname}`
      }

      this.launch(bin, settings.variant)
      this.startWatching()

      const protection = await this.protection(settings)
      if (protection === 'password-only') {
        this.logger.warn('Direct Connection: the UI is protected only by its password. Turn on two-factor authentication for every admin user, or put Cloudflare Access in front of the tunnel.')
      }
    } catch (e) {
      this.desiredRunning = false
      this.state = 'error'
      this.lastError = e.message
      await this.gateway.stop()
      throw e
    }
  }

  /**
   * Find or create the named tunnel for the hostname, make sure we hold its
   * credentials, point the hostname at it and write the ingress config.
   */
  private async provisionNamedTunnel(bin: string, settings: DirectConnectionSettings): Promise<string> {
    const name = this.tunnelNameFor(settings.hostname)

    let tunnelId: string | null = null
    const list = await this.runCloudflared(bin, [
      'tunnel',
      'list',
      '--name',
      name,
      '--output',
      'json',
    ])
    if (list.code === 0) {
      try {
        const tunnels = JSON.parse(list.stdout)
        const match = Array.isArray(tunnels)
          ? tunnels.find(t => t?.name === name)
          : null
        tunnelId = match?.id ?? null
      } catch {
        // Fall through to create, which reports a useful error if it exists
      }
    } else {
      throw new Error(this.describeFailure('list tunnels', list))
    }

    if (tunnelId) {
      if (!(await pathExists(this.credentialsPath(tunnelId)))) {
        // Signed out and back in, or moved storage - fetch the credentials again
        const token = await this.runCloudflared(bin, [
          'tunnel',
          'token',
          '--cred-file',
          this.credentialsPath(tunnelId),
          tunnelId,
        ])
        if (token.code !== 0) {
          throw new Error(this.describeFailure(`fetch the credentials for tunnel ${name}`, token))
        }
      }
    } else {
      this.logger.log(`Direct Connection: creating Cloudflare tunnel ${name}.`)
      const created = await this.runCloudflared(bin, [
        'tunnel',
        'create',
        '--cred-file',
        this.credentialsPath('pending'),
        '--output',
        'json',
        name,
      ])
      if (created.code !== 0) {
        await remove(this.credentialsPath('pending'))
        throw new Error(this.describeFailure(`create tunnel ${name}`, created))
      }
      try {
        tunnelId = JSON.parse(created.stdout)?.id ?? null
      } catch {
        tunnelId = created.stdout.match(UUID_REGEX)?.[0] ?? null
      }
      if (!tunnelId || !UUID_REGEX.test(tunnelId)) {
        throw new Error('Could not read the new tunnel id from cloudflared.')
      }
      await rename(this.credentialsPath('pending'), this.credentialsPath(tunnelId))
    }

    // Never pass --overwrite-dns: an existing record for the hostname belongs
    // to the user and must not be replaced without them knowing.
    const route = await this.runCloudflared(bin, [
      'tunnel',
      'route',
      'dns',
      tunnelId,
      settings.hostname,
    ])
    if (route.code !== 0) {
      // Cloudflare error 1003: a record with this name already exists
      if (/code: 1003\b|record with that host already exists/i.test(`${route.stderr}\n${route.stdout}`)) {
        throw new Error(`A DNS record for ${settings.hostname} already exists in Cloudflare. If it points to an old tunnel or a service you no longer use, delete it under DNS → Records in the Cloudflare dashboard and connect again. Otherwise, choose a different hostname.`)
      }
      throw new Error(this.describeFailure(`route ${settings.hostname} to the tunnel`, route))
    }

    // cloudflared appends the signed-in zone to hostnames outside it, so
    // `home.other.com` on an `example.com` login becomes
    // `home.other.com.example.com`. Catch that rather than report success.
    const routedTo = `${route.stdout}\n${route.stderr}`.match(/Added CNAME (\S+)|(\S+) is already configured to route to your tunnel/)
    const routedHostname = (routedTo?.[1] || routedTo?.[2])?.toLowerCase()
    if (routedHostname && routedHostname !== settings.hostname) {
      throw new Error(`${settings.hostname} is not in the Cloudflare zone you signed in with (cloudflared routed ${routedHostname} instead). Sign out, then sign in and choose the zone that holds ${settings.hostname}.`)
    }

    await this.writeNamedConfig(tunnelId, settings.hostname)
    return tunnelId
  }

  private async writeNamedConfig(tunnelId: string, hostname: string) {
    const url = this.gatewayUrl()
    // JSON strings are valid YAML double-quoted scalars, which keeps Windows
    // paths and any odd characters safe.
    const yaml = [
      '# Managed by Homebridge UI (Direct Connection). Changes are overwritten.',
      `tunnel: ${JSON.stringify(tunnelId)}`,
      `credentials-file: ${JSON.stringify(this.credentialsPath(tunnelId))}`,
      'no-autoupdate: true',
      'ingress:',
      `  - hostname: ${JSON.stringify(hostname)}`,
      `    service: ${JSON.stringify(url)}`,
      '  - service: http_status:404',
      '',
    ].join('\n')
    await writeFile(this.namedConfigPath, yaml, { mode: 0o600 })
  }

  /**
   * Where cloudflared sends requests: the gateway, never the UI itself.
   */
  private gatewayUrl(): string {
    const url = this.gateway.url
    if (!url) {
      throw new Error('The Direct Connection gateway is not running.')
    }
    return url
  }

  /**
   * Where the gateway reaches the UI on this host.
   */
  private originService(): { url: string, https: boolean } {
    const ui = this.configService.ui
    const dev = process.env.UIX_DEVELOPMENT === '1'
    const ssl = dev ? undefined : ui.ssl
    const https = Boolean(ssl && (ssl.selfSigned || (ssl.key && ssl.cert) || ssl.pfx))

    let host = '127.0.0.1'
    const configured = dev ? undefined : ui.host
    if (configured === '::') {
      host = '[::1]'
    } else if (configured && configured !== '0.0.0.0') {
      host = isIPv6(configured)
        ? `[${configured}]`
        : configured
    }

    return { url: `${https ? 'https' : 'http'}://${host}:${ui.port}`, https }
  }

  private launch(bin: string, variant: DirectConnectionVariant) {
    const args = variant === 'named'
      ? [
          'tunnel',
          '--no-autoupdate',
          '--config',
          this.namedConfigPath,
          'run',
        ]
      : this.quickTunnelArgs()

    this.connections.clear()
    this.lastCloudflaredError = null
    if (variant === 'quick') {
      // Every quick tunnel run gets a new random address
      this.publicUrl = null
    }
    const proc = this.spawnCloudflared(bin, args)
    this.tunnelProcess = proc

    let pending = ''
    const onData = (data: Buffer) => {
      pending += data.toString()
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() ?? ''
      for (const line of lines) {
        this.handleTunnelOutput(proc, line)
      }
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)

    // A failed spawn (missing or non-executable binary) may emit 'error'
    // without 'close'; handleTunnelExit ignores whichever arrives second.
    proc.once('error', (e) => {
      this.lastCloudflaredError = e.message
      this.handleTunnelExit(proc, null, null)
    })
    proc.once('close', (code, signal) => this.handleTunnelExit(proc, code, signal))
  }

  private quickTunnelArgs(): string[] {
    const url = this.gatewayUrl()
    // An explicit --config stops cloudflared falling back to a system-wide
    // /etc/cloudflared/config.yml, which would refuse to run a quick tunnel.
    return [
      'tunnel',
      '--no-autoupdate',
      '--config',
      this.quickConfigPath,
      '--url',
      url,
    ]
  }

  private handleTunnelOutput(proc: ChildProcess, line: string) {
    if (proc !== this.tunnelProcess || !line.trim()) {
      return
    }

    this.logger.debug(`[cloudflared] ${line}`)

    const quickUrl = line.match(QUICK_URL_REGEX)
    if (quickUrl && !this.publicUrl) {
      this.publicUrl = quickUrl[0]
    }

    const index = line.match(/connIndex=(\d+)/)?.[1] ?? '0'
    if (line.includes('Registered tunnel connection')) {
      const wasConnected = this.state === 'connected'
      this.connections.add(index)
      this.state = 'connected'
      this.restartAttempts = 0
      this.lastError = null
      if (!wasConnected) {
        this.logger.log(`Direct Connection: tunnel connected${this.publicUrl
          ? ` - ${this.publicUrl}`
          : ''}.`)
      }
    } else if (line.includes('Unregistered tunnel connection')) {
      this.connections.delete(index)
      if (this.connections.size === 0 && this.state === 'connected') {
        this.state = 'reconnecting'
      }
    }

    if (/\bERR\b/.test(line)) {
      const message = line.replace(/^\S+\s+ERR\s+/, '').trim()
      // cloudflared repeats the same error on every retry while the network
      // is down; only the first of a run is worth a line in the main log
      if (message !== this.lastCloudflaredError) {
        this.logger.warn(`Direct Connection: ${message}`)
      }
      this.lastCloudflaredError = message
    }
  }

  private handleTunnelExit(proc: ChildProcess, code: number | null, signal: string | null) {
    if (proc !== this.tunnelProcess) {
      return
    }
    this.tunnelProcess = null
    this.connections.clear()

    if (!this.desiredRunning) {
      this.state = 'stopped'
      return
    }

    const reason = this.lastCloudflaredError ?? `exited with ${signal ?? `code ${code}`}`
    this.lastError = `cloudflared stopped: ${reason}`
    this.state = 'reconnecting'

    const delay = Math.min(RESTART_BASE_DELAY_MS * 2 ** this.restartAttempts, RESTART_MAX_DELAY_MS)
    this.restartAttempts++
    this.logger.warn(`Direct Connection: ${this.lastError}. Restarting in ${Math.round(delay / 1000)}s.`)

    this.clearRestartTimer()
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      void this.exclusive(async () => {
        if (!this.desiredRunning || this.tunnelProcess) {
          return
        }
        try {
          const settings = await this.loadSettings()
          await this.gateway.start()
          this.launch(await this.getBinary(), settings.variant)
        } catch (e) {
          this.state = 'error'
          this.lastError = e.message
          this.desiredRunning = false
          this.logger.error(`Direct Connection: could not restart the tunnel: ${e.message}`)
        }
      })
    }, delay)
  }

  private async stopTunnel() {
    this.desiredRunning = false
    this.clearRestartTimer()
    this.stopWatching()
    await this.stopTunnelProcess()
    await this.gateway.stop()
    this.accessVerifier = null
    this.state = 'stopped'
    this.publicUrl = null
    this.connections.clear()
  }

  private async stopTunnelProcess() {
    const proc = this.tunnelProcess
    if (!proc) {
      return
    }
    this.tunnelProcess = null
    if (proc.exitCode !== null || proc.signalCode !== null) {
      return
    }

    this.logger.log('Direct Connection: stopping tunnel.')
    await new Promise<void>((done) => {
      const forceKill = setTimeout(() => proc.kill('SIGKILL'), STOP_GRACE_MS)
      proc.once('close', () => {
        clearTimeout(forceKill)
        done()
      })
      proc.kill('SIGTERM')
    })
  }

  private stopLogin() {
    if (this.loginProcess) {
      this.loginProcess.kill()
      this.loginProcess = null
    }
    this.loginUrl = null
  }

  private clearRestartTimer() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
  }

  /**
   * Run one state-changing operation at a time, so a double click cannot
   * start two cloudflared processes.
   */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => {})
    return run
  }

  private tunnelNameFor(hostname: string): string {
    return `homebridge-${hostname.replace(/[^a-z0-9-]/gi, '-')}`.slice(0, 120)
  }

  private credentialsPath(tunnelId: string): string {
    return join(this.credentialsDir, `${tunnelId}.json`)
  }

  private describeFailure(action: string, result: CloudflaredResult): string {
    const detail = `${result.stderr}\n${result.stdout}`
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .reverse()
      .find(line => /\b(?:ERR|error|failed)\b/i.test(line)) ?? `exit code ${result.code}`
    return `Could not ${action}: ${this.tidyCloudflaredMessage(detail)}`
  }

  /**
   * Strip the log prefix, API error wrapper and trailing docs link that
   * cloudflared adds, leaving the part a person can act on.
   */
  private tidyCloudflaredMessage(line: string): string {
    return line
      .replace(/^\S+\s+(?:ERR|INF|WRN)\s+/, '')
      .replace(/^.*?code:\s*\d+,\s*reason:\s*/i, '')
      .replace(/\s*For more details, refer to <[^>]*>\.?/i, '')
      .trim()
  }

  private async prepareBaseDir() {
    await ensureDir(this.baseDir)
    await ensureDir(this.credentialsDir)
    if (process.platform !== 'win32') {
      // Holds a Cloudflare account certificate and tunnel secrets
      await chmod(this.baseDir, 0o700)
    }
    if (!(await pathExists(this.quickConfigPath))) {
      await writeFile(this.quickConfigPath, '# Managed by Homebridge UI (Direct Connection).\nno-autoupdate: true\n', { mode: 0o600 })
    }
  }

  protected async getBinary(): Promise<string> {
    try {
      return await ensureCloudflaredBinary(this.binDir)
    } catch (e) {
      throw new Error(`Could not download cloudflared: ${e.message}`)
    }
  }

  /**
   * The environment every cloudflared process runs with. HOME points at our
   * own directory so `tunnel login` writes the certificate there, and any
   * TUNNEL_* variables from the service environment are dropped so they
   * cannot change which tunnel or account is used.
   */
  private cloudflaredEnv(): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('TUNNEL_')) {
        env[key] = value
      }
    }
    return {
      ...env,
      HOME: this.baseDir,
      USERPROFILE: this.baseDir,
      NO_AUTOUPDATE: 'true',
      TUNNEL_ORIGIN_CERT: this.certPath,
    }
  }

  protected spawnCloudflared(bin: string, args: string[]): ChildProcess {
    return spawn(bin, args, {
      cwd: this.baseDir,
      env: this.cloudflaredEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  }

  protected runCloudflared(bin: string, args: string[]): Promise<CloudflaredResult> {
    return new Promise((done) => {
      const proc = this.spawnCloudflared(bin, args)
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        stderr += '\nERR cloudflared did not respond in time'
        proc.kill('SIGKILL')
      }, COMMAND_TIMEOUT_MS)
      let finished = false
      const finish = (code: number | null) => {
        if (!finished) {
          finished = true
          clearTimeout(timer)
          done({ code, stdout, stderr })
        }
      }
      proc.stdout?.on('data', (d) => {
        stdout += d.toString()
      })
      proc.stderr?.on('data', (d) => {
        stderr += d.toString()
      })
      proc.once('error', (e) => {
        stderr += `\nERR ${e.message}`
        finish(null)
      })
      proc.once('close', code => finish(code))
    })
  }

  private async loadSettings(): Promise<DirectConnectionSettings> {
    if (!this.settings) {
      let stored: Partial<DirectConnectionSettings> = {}
      try {
        if (await pathExists(this.settingsPath)) {
          stored = await this.jsonStore.read<Partial<DirectConnectionSettings>>(this.settingsPath)
        }
      } catch (e) {
        this.logger.error(`Direct Connection: could not read ${this.settingsPath}: ${e.message}`)
      }
      this.settings = {
        enabled: stored.enabled === true,
        variant: stored.variant === 'quick'
          ? 'quick'
          : 'named',
        hostname: typeof stored.hostname === 'string'
          ? stored.hostname
          : '',
        tunnelId: typeof stored.tunnelId === 'string' && UUID_REGEX.test(stored.tunnelId)
          ? stored.tunnelId
          : null,
        accessTeamDomain: typeof stored.accessTeamDomain === 'string'
          ? stored.accessTeamDomain
          : '',
        accessAudience: typeof stored.accessAudience === 'string'
          ? stored.accessAudience
          : '',
      }
    }
    return { ...this.settings }
  }

  private async saveSettings(settings: DirectConnectionSettings) {
    await ensureDir(this.baseDir)
    await this.jsonStore.write(this.settingsPath, settings, { spaces: 2 })
    this.settings = { ...settings }
  }
}
