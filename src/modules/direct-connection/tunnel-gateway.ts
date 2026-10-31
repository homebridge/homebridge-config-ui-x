import type { Buffer } from 'node:buffer'
import type { IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders, Server, ServerResponse } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'

import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

import {
  TUNNEL_CLIENT_IP_HEADER,
  TUNNEL_MARK_HEADER,
  TUNNEL_PROTO_HEADER,
  tunnelMark,
} from '../../core/auth/tunnel-request.js'

export interface GatewayDenial {
  status: number
  message: string
}

export interface TunnelGatewayOptions {
  /** Where the UI is listening on this host. */
  origin: () => { url: string, https: boolean }
  /** Return a denial to refuse a request before it reaches the UI. */
  check: (req: IncomingMessage) => Promise<GatewayDenial | null> | GatewayDenial | null
  onError?: (message: string) => void
}

// Headers that describe one hop and must not be forwarded as-is
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/**
 * A small reverse proxy on 127.0.0.1 that cloudflared is pointed at instead
 * of the UI itself.
 *
 * Without it, tunneled requests reach the UI as ordinary local requests from
 * 127.0.0.1 over HTTP, and the UI cannot tell them apart from someone on the
 * host. Going through the gateway means every tunneled request (including
 * WebSocket upgrades for the terminal, logs and accessories):
 *
 * - is checked before it reaches the UI, so the tunnel stops serving the
 *   moment authentication is turned off, and Cloudflare Access is enforced
 *   when it is configured;
 * - carries a mark the UI can trust (see core/auth/tunnel-request.ts), with
 *   the visitor's real address for login throttling and the edge protocol
 *   for Secure cookies.
 */
export class TunnelGateway {
  private server: Server | null = null
  private readonly sockets = new Set<Socket>()
  // Connections that are being refused: they close themselves once the
  // refusal is sent, so cutting them early would only lose the answer
  private readonly closing = new WeakSet<Socket>()

  constructor(private readonly options: TunnelGatewayOptions) {}

  get port(): number | null {
    const address = this.server?.address() as AddressInfo | null | undefined
    return address?.port ?? null
  }

  get url(): string | null {
    return this.port
      ? `http://127.0.0.1:${this.port}`
      : null
  }

  async start(): Promise<string> {
    if (this.server) {
      return this.url
    }

    const server = createServer((req, res) => void this.handleRequest(req, res))
    server.on('upgrade', (req, socket: Socket, head) => void this.handleUpgrade(req, socket, head))
    server.on('connection', (socket: Socket) => {
      this.sockets.add(socket)
      socket.once('close', () => this.sockets.delete(socket))
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      // Loopback only, on a port the OS picks. Only cloudflared connects here.
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    this.server = server
    return this.url
  }

  async stop() {
    const server = this.server
    if (!server) {
      return
    }
    this.server = null
    this.dropConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }

  /**
   * Drop every open connection, including upgraded WebSockets, so a session
   * that was open when the tunnel became unsafe does not stay usable.
   */
  dropConnections() {
    for (const socket of this.sockets) {
      if (!this.closing.has(socket)) {
        socket.destroy()
      }
    }
  }

  private async deny(req: IncomingMessage): Promise<GatewayDenial | null> {
    try {
      return await this.options.check(req)
    } catch (e) {
      this.options.onError?.(`Direct Connection: request check failed: ${e.message}`)
      return { status: 503, message: 'Service unavailable' }
    }
  }

  private forwardHeaders(req: IncomingMessage, keepUpgrade: boolean): OutgoingHttpHeaders {
    const headers: OutgoingHttpHeaders = {}
    const connectionTokens = new Set(
      String(req.headers.connection ?? '')
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean),
    )

    for (const [name, value] of Object.entries(req.headers as IncomingHttpHeaders)) {
      const lower = name.toLowerCase()
      // Never let a visitor supply the marks the UI trusts
      if (lower.startsWith(TUNNEL_MARK_HEADER)) {
        continue
      }
      if (!keepUpgrade && (HOP_BY_HOP.has(lower) || connectionTokens.has(lower))) {
        continue
      }
      headers[lower] = value
    }

    const clientIp = req.headers['cf-connecting-ip']
    const proto = req.headers['x-forwarded-proto']
    headers[TUNNEL_MARK_HEADER] = tunnelMark()
    headers[TUNNEL_CLIENT_IP_HEADER] = (Array.isArray(clientIp)
      ? clientIp[0]
      : clientIp) ?? ''
    headers[TUNNEL_PROTO_HEADER] = (Array.isArray(proto)
      ? proto[0]
      : proto) === 'http'
      ? 'http'
      : 'https'
    return headers
  }

  private originRequest(req: IncomingMessage, keepUpgrade: boolean) {
    const { url, https } = this.options.origin()
    const target = new URL(url)
    const send = https ? httpsRequest : httpRequest
    return send({
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: target.port,
      method: req.method,
      path: req.url,
      headers: this.forwardHeaders(req, keepUpgrade),
      // The UI's own certificate is usually self-signed; this hop never
      // leaves the host.
      ...(https
        ? { rejectUnauthorized: false }
        : {}),
    })
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse) {
    const denial = await this.deny(req)
    if (denial) {
      this.closing.add(req.socket)
      res.writeHead(denial.status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'connection': 'close' })
      res.end(denial.message)
      req.resume()
      return
    }

    const upstream = this.originRequest(req, false)
    upstream.on('response', (upstreamRes) => {
      const headers = { ...upstreamRes.headers }
      for (const name of HOP_BY_HOP) {
        delete headers[name]
      }
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.statusMessage, headers)
      upstreamRes.pipe(res)
    })
    upstream.on('error', (e) => {
      this.options.onError?.(`Direct Connection: could not reach the UI: ${e.message}`)
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      }
      res.end('Bad gateway')
    })
    req.on('aborted', () => upstream.destroy())
    req.pipe(upstream)
  }

  private async handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
    socket.on('error', () => socket.destroy())

    const denial = await this.deny(req)
    if (denial) {
      this.closing.add(socket)
      socket.end(`HTTP/1.1 ${denial.status} ${denial.message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
      return
    }

    const upstream = this.originRequest(req, true)
    upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
      upstreamSocket.on('error', () => socket.destroy())
      socket.on('close', () => upstreamSocket.destroy())
      upstreamSocket.on('close', () => socket.destroy())

      const lines = [`HTTP/1.1 ${upstreamRes.statusCode} ${upstreamRes.statusMessage}`]
      for (let i = 0; i < upstreamRes.rawHeaders.length; i += 2) {
        lines.push(`${upstreamRes.rawHeaders[i]}: ${upstreamRes.rawHeaders[i + 1]}`)
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`)
      if (upstreamHead?.length) {
        socket.write(upstreamHead)
      }
      if (head?.length) {
        upstreamSocket.write(head)
      }
      upstreamSocket.pipe(socket)
      socket.pipe(upstreamSocket)
    })
    upstream.on('response', (upstreamRes) => {
      // The UI declined the upgrade; pass its answer back and close
      socket.end(`HTTP/1.1 ${upstreamRes.statusCode} ${upstreamRes.statusMessage}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
      upstreamRes.resume()
    })
    upstream.on('error', () => socket.destroy())
    upstream.end()
  }
}
