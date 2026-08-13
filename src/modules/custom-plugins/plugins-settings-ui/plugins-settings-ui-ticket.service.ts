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

  consume(ticket: string | undefined, pluginName: string): SettingsUiTicket {
    if (!ticket || ticket.length > 128) {
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

  issueAssetSession(pluginName: string, username: string): string {
    const token = randomBytes(32).toString('base64url')
    this.assetSessions.set(this.digest(token), { pluginName, username } satisfies SettingsUiAssetSession)
    return token
  }

  validateAssetSession(token: string | undefined, pluginName: string): string {
    if (!token || token.length > 128) {
      throw new UnauthorizedException()
    }
    const digest = this.digest(token)
    const session = this.assetSessions.get<SettingsUiAssetSession>(digest)
    if (!session || session.pluginName !== pluginName) {
      throw new UnauthorizedException()
    }
    this.assetSessions.ttl(digest, PluginsSettingsUiTicketService.assetSessionTtl)
    return token
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
