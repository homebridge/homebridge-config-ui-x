import type { IncomingHttpHeaders } from 'node:http'

import { Buffer } from 'node:buffer'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

/**
 * Requests that reach the UI through a Direct Connection (Cloudflare Tunnel)
 * arrive from cloudflared on this host, so to the UI they look like local
 * requests from 127.0.0.1 over plain HTTP. The Direct Connection gateway (the
 * only thing cloudflared is pointed at) marks every request it forwards with
 * these headers, so the rest of the UI can tell a tunneled request apart.
 *
 * The mark is a random value generated at startup that never leaves this
 * process. The gateway strips any copy of these headers that arrives from
 * outside, so a client cannot forge them.
 */
export const TUNNEL_MARK_HEADER = 'x-uix-direct-connection'
export const TUNNEL_CLIENT_IP_HEADER = 'x-uix-direct-connection-client'
export const TUNNEL_PROTO_HEADER = 'x-uix-direct-connection-proto'

const TUNNEL_MARK = randomBytes(32).toString('hex')

export function tunnelMark(): string {
  return TUNNEL_MARK
}

export interface TunnelRequestInfo {
  /** The visitor's address as Cloudflare saw it, or null if Cloudflare did not send one. */
  clientIp: string | null
  /** Whether the visitor's browser is on HTTPS (the Cloudflare edge, not the local hop). */
  secure: boolean
}

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name]
  return Array.isArray(value)
    ? value[0]
    : value
}

/**
 * Details of a request that came in through the Direct Connection tunnel, or
 * null for any other request.
 */
export function getTunnelRequestInfo(headers: IncomingHttpHeaders | undefined): TunnelRequestInfo | null {
  const mark = headers && header(headers, TUNNEL_MARK_HEADER)
  if (typeof mark !== 'string' || mark.length !== TUNNEL_MARK.length) {
    return null
  }
  if (!timingSafeEqual(Buffer.from(mark), Buffer.from(TUNNEL_MARK))) {
    return null
  }

  const clientIp = header(headers, TUNNEL_CLIENT_IP_HEADER)
  return {
    clientIp: clientIp && isIP(clientIp)
      ? clientIp
      : null,
    secure: header(headers, TUNNEL_PROTO_HEADER) !== 'http',
  }
}

/**
 * Whether the browser that sent this request is on HTTPS. A tunneled request
 * reaches the UI over local HTTP, but the browser is on HTTPS at the Cloudflare
 * edge, so session cookies must still be marked Secure.
 */
export function isSecureRequest(req: { protocol?: string, headers?: IncomingHttpHeaders }): boolean {
  if (req.protocol === 'https') {
    return true
  }
  return getTunnelRequestInfo(req.headers)?.secure ?? false
}

/**
 * The address to throttle failed logins by. Every tunneled request comes
 * from cloudflared on 127.0.0.1, so keying on that would let one visitor lock
 * out every other remote user (and the throttle would not separate attackers).
 * Use the visitor's address from Cloudflare instead.
 */
export function getClientAddress(req: { ip?: string, headers?: IncomingHttpHeaders }): string | undefined {
  const tunnel = getTunnelRequestInfo(req.headers)
  if (tunnel) {
    return `tunnel:${tunnel.clientIp ?? 'unknown'}`
  }
  return req.ip
}
