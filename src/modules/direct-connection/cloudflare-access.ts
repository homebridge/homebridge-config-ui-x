import type { KeyObject } from 'node:crypto'

import { Buffer } from 'node:buffer'
import { createPublicKey, verify } from 'node:crypto'

import axios from 'axios'

const KEY_REFRESH_MIN_INTERVAL_MS = 60_000
const KEY_MAX_AGE_MS = 60 * 60_000
const CLOCK_SKEW_SECONDS = 60

/**
 * Turn what a user pastes (`myteam`, `myteam.cloudflareaccess.com` or
 * `https://myteam.cloudflareaccess.com/`) into the team domain.
 */
export function normaliseTeamDomain(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!trimmed) {
    return ''
  }
  return trimmed.includes('.')
    ? trimmed
    : `${trimmed}.cloudflareaccess.com`
}

/**
 * Checks the `Cf-Access-Jwt-Assertion` token that Cloudflare Access adds to
 * every request it lets through, so a request that reached the tunnel without
 * passing the Access policy is refused at the origin too.
 *
 * See https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */
export class CloudflareAccessVerifier {
  private keys = new Map<string, KeyObject>()
  private fetchedAt = 0
  private fetching: Promise<void> | null = null

  constructor(
    public readonly teamDomain: string,
    public readonly audience: string,
  ) {}

  private get issuer() {
    return `https://${this.teamDomain}`
  }

  async verify(token: string | undefined): Promise<boolean> {
    if (!token) {
      return false
    }

    const parts = token.split('.')
    if (parts.length !== 3) {
      return false
    }

    let header: { alg?: string, kid?: string }
    let payload: { aud?: string | string[], iss?: string, exp?: number, nbf?: number }
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    } catch {
      return false
    }

    if (header.alg !== 'RS256' || !header.kid) {
      return false
    }

    const key = await this.getKey(header.kid)
    if (!key) {
      return false
    }

    const signedOk = verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], 'base64url'),
    )
    if (!signedOk) {
      return false
    }

    const now = Math.floor(Date.now() / 1000)
    const audiences = Array.isArray(payload.aud)
      ? payload.aud
      : [payload.aud]
    return payload.iss === this.issuer
      && audiences.includes(this.audience)
      && typeof payload.exp === 'number'
      && payload.exp + CLOCK_SKEW_SECONDS > now
      && (typeof payload.nbf !== 'number' || payload.nbf - CLOCK_SKEW_SECONDS <= now)
  }

  private async getKey(kid: string): Promise<KeyObject | null> {
    const stale = Date.now() - this.fetchedAt > KEY_MAX_AGE_MS
    // Cloudflare rotates its signing keys; fetch again for an unknown key id,
    // but not more than once a minute so bad tokens cannot hammer the API.
    const unknownAndAllowed = !this.keys.has(kid) && Date.now() - this.fetchedAt > KEY_REFRESH_MIN_INTERVAL_MS
    if (stale || unknownAndAllowed) {
      await this.refreshKeys().catch(() => {})
    }
    return this.keys.get(kid) ?? null
  }

  private refreshKeys(): Promise<void> {
    if (!this.fetching) {
      this.fetching = (async () => {
        try {
          const res = await axios.get<{ keys?: ({ kid?: string, kty?: string } & Record<string, unknown>)[] }>(`${this.issuer}/cdn-cgi/access/certs`, {
            timeout: 10_000,
          })
          const keys = new Map<string, KeyObject>()
          for (const jwk of res.data?.keys ?? []) {
            if (jwk.kid && jwk.kty === 'RSA') {
              keys.set(jwk.kid, createPublicKey({ key: jwk as any, format: 'jwk' }))
            }
          }
          if (keys.size) {
            this.keys = keys
          }
        } finally {
          this.fetchedAt = Date.now()
          this.fetching = null
        }
      })()
    }
    return this.fetching
  }
}
