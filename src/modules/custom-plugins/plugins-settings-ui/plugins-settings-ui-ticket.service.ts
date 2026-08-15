import { createHash, randomBytes } from 'node:crypto'
import process from 'node:process'

import { Injectable, UnauthorizedException } from '@nestjs/common'
import NodeCache from 'node-cache'

import { DEV_SERVER_PORTS } from '../../../core/regex.constants.js'

interface SettingsUiTicket {
  pluginName: string
  username: string
  uiOrigin: string
}

interface SettingsUiAssetSession {
  pluginName: string
  username: string
  uiOrigin: string
}

export interface ValidatedSettingsUiAssetSession extends SettingsUiAssetSession {
  token: string
}

@Injectable()
export class PluginsSettingsUiTicketService {
  static readonly assetSessionTtl = 1800

  private readonly tickets = new NodeCache({ stdTTL: 60, useClones: false })

  private readonly assetSessions = new NodeCache({
    stdTTL: PluginsSettingsUiTicketService.assetSessionTtl,
    useClones: false,
  })

  issue(pluginName: string, username: string, requestOrigin?: string, requestHost?: string) {
    const ticket = randomBytes(32).toString('base64url')
    this.tickets.set(this.digest(ticket), {
      pluginName,
      username,
      uiOrigin: this.resolveDevelopmentOrigin(requestOrigin, requestHost),
    } satisfies SettingsUiTicket)
    return ticket
  }

  consume(ticket: unknown, pluginName: string): SettingsUiTicket {
    if (typeof ticket !== 'string' || !ticket || ticket.length > 128) {
      throw new UnauthorizedException()
    }

    // take() deletes synchronously, making redemption single-use even when two
    // requests arrive in the same event-loop turn.
    const claims = this.tickets.take<SettingsUiTicket>(this.digest(ticket))
    if (!claims || claims.pluginName !== pluginName) {
      throw new UnauthorizedException()
    }
    return claims
  }

  issueAssetSession(pluginName: string, username: string, uiOrigin: string): string {
    const token = randomBytes(32).toString('base64url')
    this.assetSessions.set(this.digest(token), { pluginName, username, uiOrigin } satisfies SettingsUiAssetSession)
    return token
  }

  validateAssetSession(token: string | undefined, pluginName: string): ValidatedSettingsUiAssetSession {
    if (!token || token.length > 128) {
      throw new UnauthorizedException()
    }
    const digest = this.digest(token)
    const session = this.assetSessions.get<SettingsUiAssetSession>(digest)
    if (!session || session.pluginName !== pluginName) {
      throw new UnauthorizedException()
    }
    this.assetSessions.ttl(digest, PluginsSettingsUiTicketService.assetSessionTtl)
    return { ...session, token }
  }

  revokeAssetSession(token: string | undefined, pluginName: string): void {
    if (!token || token.length > 128) {
      return
    }
    const digest = this.digest(token)
    const session = this.assetSessions.get<SettingsUiAssetSession>(digest)
    if (session?.pluginName === pluginName) {
      this.assetSessions.del(digest)
    }
  }

  revokeUserPlugin(username: string, pluginName: string): void {
    for (const key of this.tickets.keys()) {
      const ticket = this.tickets.get<SettingsUiTicket>(key)
      if (ticket?.username === username && ticket.pluginName === pluginName) {
        this.tickets.del(key)
      }
    }

    for (const key of this.assetSessions.keys()) {
      const session = this.assetSessions.get<SettingsUiAssetSession>(key)
      if (session?.username === username && session.pluginName === pluginName) {
        this.assetSessions.del(key)
      }
    }
  }

  revokeUser(username: string): string[] {
    const pluginNames = new Set<string>()

    for (const key of this.tickets.keys()) {
      if (this.tickets.get<SettingsUiTicket>(key)?.username === username) {
        this.tickets.del(key)
      }
    }

    for (const key of this.assetSessions.keys()) {
      const session = this.assetSessions.get<SettingsUiAssetSession>(key)
      if (session?.username === username) {
        pluginNames.add(session.pluginName)
        this.assetSessions.del(key)
      }
    }

    return [...pluginNames]
  }

  extractAssetSession(cookieHeader: string | undefined): string | undefined {
    for (const part of cookieHeader?.split(';') ?? []) {
      const [name, ...value] = part.trim().split('=')
      if (name === 'hb-plugin-ui') {
        return value.join('=') || undefined
      }
    }
  }

  private digest(ticket: string): string {
    return createHash('sha256').update(ticket).digest('base64url')
  }

  private resolveDevelopmentOrigin(origin: string | undefined, requestHost: string | undefined): string {
    if (process.env.UIX_DEVELOPMENT !== '1' || !origin || !requestHost) {
      return ''
    }
    try {
      const url = new URL(origin)
      const requestUrl = new URL(`http://${requestHost}`)
      if ((url.protocol !== 'http:' && url.protocol !== 'https:')
        || !DEV_SERVER_PORTS.has(url.port)
        || url.origin !== origin
        || url.hostname !== requestUrl.hostname) {
        return ''
      }
      return url.origin
    } catch {
      return ''
    }
  }
}
