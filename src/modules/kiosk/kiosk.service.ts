/**
 * Paired kiosk tablets - security model
 *
 * - A kiosk device is a record an administrator creates for a kiosk tablet. Its `scope` (rooms, categories,
 *   subcategories, labels) and `scopeLabel` only describe what the tablet shows; the enforced limit is the explicit
 *   list of accessory uniqueIds (`allowedUniqueIds`), which is what every check uses. Sensitive services (locks, garage doors, security systems)
 *   can be viewed but not controlled unless `allowSensitive` is set.
 * - A device authenticates with a random 32-byte token, only ever sent as `Authorization: Kiosk <token>` (HTTP) or
 *   the socket handshake `auth.kioskToken`. Only the SHA-256 of the token is stored, so the file cannot be used to
 *   sign in. The token is shown once, in the response to pairing.
 * - Pairing uses a short-lived (10 minutes), single-use 8-character code, stored only as a hash. Attempts are
 *   rate limited per IP, and hashes are compared in constant time. A new code replaces the previous one.
 * - Kiosk tokens are not JWTs and never set `request.user`: the JWT guards and the admin guard cannot accept them,
 *   and the kiosk routes accept nothing else. A revoked or re-paired device loses its sockets immediately, and
 *   every control message re-checks the stored device.
 * - Tokens and codes are never logged. The file is written with mode 0600.
 */
import type { Socket } from 'socket.io'

import { Buffer } from 'node:buffer'
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'

import { ConfigService } from '../../core/config/config.service.js'
import { JsonFileStoreService } from '../../core/fs/json-file-store.service.js'
import { AccessoriesService } from '../accessories/accessories.service.js'

export interface KioskScope {
  rooms: string[]
  categories: string[]
  subcategories: string[]
  labels: string[]
}

export interface KioskDevice {
  id: string
  name: string
  owner: string
  scope: KioskScope
  scopeLabel: string
  allowSensitive: boolean
  allowedUniqueIds: string[]
  tokenHash?: string
  pairing?: { codeHash: string, expiresAt: number }
  createdAt: number
  lastSeenAt?: number
  lastSeenIp?: string
}

function cleanScope(scope?: Partial<KioskScope>): KioskScope {
  const list = (v: unknown) => Array.isArray(v)
    ? [
        ...new Set(v.filter((x): x is string => typeof x === 'string')),
      ]
    : []
  return {
    rooms: list(scope?.rooms),
    categories: list(scope?.categories),
    subcategories: list(scope?.subcategories),
    labels: list(scope?.labels),
  }
}

/** Devices stored before scopes existed have `viewId`/`viewName`: they get an empty scope and the view name as label */
function migrateDevice(raw: any): KioskDevice {
  const { viewName, ...device } = raw ?? {}
  delete device.viewId
  return {
    ...device,
    scope: cleanScope(device.scope),
    scopeLabel: typeof device.scopeLabel === 'string'
      ? device.scopeLabel
      : typeof viewName === 'string'
        ? viewName
        : '',
  } as KioskDevice
}

/** No 0/O/1/I/L: easy to misread when typed from a screen */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8
const CODE_TTL_MS = 10 * 60 * 1000
const PAIR_WINDOW_MS = 10 * 60 * 1000
const PAIR_MAX_ATTEMPTS = 10
const LAST_SEEN_INTERVAL_MS = 60 * 1000
const TOKEN_PATTERN = /^[\w-]{20,100}$/

export const SENSITIVE_HAP_TYPES = new Set([
  'LockMechanism',
  'GarageDoorOpener',
  'SecuritySystem',
  'LockManagement',
])

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest()

function hashMatches(storedHex: string | undefined, candidate: Buffer): boolean {
  if (!storedHex) {
    return false
  }
  const stored = Buffer.from(storedHex, 'hex')
  return stored.length === candidate.length && timingSafeEqual(stored, candidate)
}

/** The token from `Authorization: Kiosk <token>`, or undefined for anything else (including a Bearer JWT) */
export function parseKioskAuthorization(header: string | undefined): string | undefined {
  if (typeof header !== 'string') {
    return undefined
  }
  const match = /^Kiosk (\S+)$/.exec(header.trim())
  return match && TOKEN_PATTERN.test(match[1])
    ? match[1]
    : undefined
}

/** What an administrator sees: no token hash and no pairing secret */
export function publicDevice(device: KioskDevice) {
  const { tokenHash, ...rest } = device
  delete rest.pairing
  return { ...rest, paired: !!tokenHash }
}

@Injectable()
export class KioskService {
  private devices: KioskDevice[] = []
  private readonly sockets = new Map<string, Set<Socket>>()
  private readonly lastSeenWrites = new Map<string, number>()
  private readonly pairAttempts = new Map<string, { count: number, resetAt: number }>()

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(JsonFileStoreService) private readonly jsonStore: JsonFileStoreService,
    @Inject(AccessoriesService) private readonly accessoriesService: AccessoriesService,
  ) {}

  private get path() {
    return this.configService.kioskDevicesPath
  }

  /** Read the file and refresh the in-memory copy that `peekDevice` uses */
  private async readAll(): Promise<KioskDevice[]> {
    try {
      const data = await this.jsonStore.read<KioskDevice[]>(this.path)
      this.devices = Array.isArray(data)
        ? data.map(migrateDevice)
        : []
    } catch (e: any) {
      if (e?.code !== 'ENOENT') {
        throw e
      }
      this.devices = []
    }
    return this.devices
  }

  private async mutate<T>(fn: (devices: KioskDevice[]) => T): Promise<T> {
    let result: T
    await this.jsonStore.mutate<KioskDevice[]>(this.path, (current) => {
      const devices = Array.isArray(current)
        ? current.map(migrateDevice)
        : []
      result = fn(devices)
      this.devices = devices
      return devices
    }, { mode: 0o600 })
    return result
  }

  /** Synchronous view of the last known state, for filtering live socket events */
  peekDevice(id: string): KioskDevice | undefined {
    return this.devices.find(d => d.id === id)
  }

  async getDevice(id: string): Promise<KioskDevice | undefined> {
    return (await this.readAll()).find(d => d.id === id)
  }

  async listDevices() {
    return (await this.readAll()).map(publicDevice)
  }

  async createDevice(owner: string, body: Pick<KioskDevice, 'name' | 'scope' | 'scopeLabel' | 'allowSensitive' | 'allowedUniqueIds'>) {
    const device: KioskDevice = {
      id: randomUUID(),
      name: body.name,
      owner,
      scope: cleanScope(body.scope),
      scopeLabel: body.scopeLabel,
      allowSensitive: body.allowSensitive === true,
      allowedUniqueIds: [
        ...new Set(body.allowedUniqueIds),
      ],
      createdAt: Date.now(),
    }
    await this.mutate(devices => devices.push(device))
    return publicDevice(device)
  }

  async updateDevice(id: string, body: Partial<Pick<KioskDevice, 'name' | 'scope' | 'scopeLabel' | 'allowSensitive' | 'allowedUniqueIds'>>) {
    const updated = await this.mutate((devices) => {
      const device = devices.find(d => d.id === id)
      if (!device) {
        return undefined
      }
      if (body.name !== undefined) {
        device.name = body.name
      }
      if (body.scope !== undefined) {
        device.scope = cleanScope(body.scope)
      }
      if (body.scopeLabel !== undefined) {
        device.scopeLabel = body.scopeLabel
      }
      if (body.allowSensitive !== undefined) {
        device.allowSensitive = body.allowSensitive === true
      }
      if (body.allowedUniqueIds !== undefined) {
        device.allowedUniqueIds = [
          ...new Set(body.allowedUniqueIds),
        ]
      }
      return device
    })
    if (!updated) {
      throw new NotFoundException()
    }
    return publicDevice(updated)
  }

  async deleteDevice(id: string) {
    const removed = await this.mutate((devices) => {
      const index = devices.findIndex(d => d.id === id)
      if (index === -1) {
        return false
      }
      devices.splice(index, 1)
      return true
    })
    if (!removed) {
      throw new NotFoundException()
    }
    this.lastSeenWrites.delete(id)
    this.disconnectDevice(id)
    return { ok: true }
  }

  /** Issue a new single-use pairing code; any earlier code stops working */
  async createPairingCode(id: string) {
    let code = ''
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    }
    const expiresAt = Date.now() + CODE_TTL_MS
    const found = await this.mutate((devices) => {
      const device = devices.find(d => d.id === id)
      if (!device) {
        return false
      }
      device.pairing = {
        codeHash: sha256(code).toString('hex'),
        expiresAt,
      }
      return true
    })
    if (!found) {
      throw new NotFoundException()
    }
    return { code, expiresAt }
  }

  private checkPairRateLimit(ip: string) {
    const now = Date.now()
    if (this.pairAttempts.size > 10000) {
      for (const [key, entry] of this.pairAttempts) {
        if (entry.resetAt <= now) {
          this.pairAttempts.delete(key)
        }
      }
    }
    let entry = this.pairAttempts.get(ip)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + PAIR_WINDOW_MS }
      this.pairAttempts.set(ip, entry)
    }
    entry.count++
    if (entry.count > PAIR_MAX_ATTEMPTS) {
      throw new HttpException('Too many pairing attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS)
    }
  }

  /** Exchange a pairing code for a device token. The code is consumed whether or not it was still valid. */
  async pair(code: string, ip: string) {
    this.checkPairRateLimit(ip || 'unknown')
    const candidate = sha256(String(code).trim().toUpperCase().replace(/[\s-]/g, ''))
    const token = randomBytes(32).toString('base64url')
    const tokenHash = sha256(token).toString('hex')
    const now = Date.now()

    const paired = await this.mutate((devices) => {
      let match: KioskDevice | undefined
      // No early exit: the loop takes the same time wherever (or whether) the code matches
      for (const device of devices) {
        if (hashMatches(device.pairing?.codeHash, candidate)) {
          match = device
        }
      }
      if (!match) {
        return null
      }
      const valid = match.pairing.expiresAt > now
      delete match.pairing
      if (!valid) {
        return null
      }
      match.tokenHash = tokenHash
      return match
    })

    if (!paired) {
      throw new UnauthorizedException('Invalid or expired pairing code')
    }
    // The previous token no longer matches: cut its sockets now
    this.disconnectDevice(paired.id)
    return {
      token,
      device: { id: paired.id, name: paired.name, scopeLabel: paired.scopeLabel },
    }
  }

  /** The device a token belongs to, or null */
  async authenticateToken(token: string): Promise<KioskDevice | null> {
    if (!TOKEN_PATTERN.test(token)) {
      return null
    }
    const candidate = sha256(token)
    let match: KioskDevice | null = null
    for (const device of await this.readAll()) {
      if (hashMatches(device.tokenHash, candidate)) {
        match = device
      }
    }
    return match
  }

  /** Record last seen, at most once a minute per device. Never lets a failure reach the caller. */
  touch(id: string, ip?: string) {
    const now = Date.now()
    if (now - (this.lastSeenWrites.get(id) ?? 0) < LAST_SEEN_INTERVAL_MS) {
      return
    }
    this.lastSeenWrites.set(id, now)
    this.mutate((devices) => {
      const device = devices.find(d => d.id === id)
      if (device) {
        device.lastSeenAt = now
        device.lastSeenIp = typeof ip === 'string'
          ? ip.slice(0, 64)
          : undefined
      }
    }).catch(() => undefined)
  }

  /** The rooms of the owner's layout, cut down to the allowed accessories */
  async buildSession(device: KioskDevice) {
    const layout = await this.accessoriesService.getAccessoryLayout(device.owner)
    const allowed = new Set(device.allowedUniqueIds)
    const rooms: { name: string, services: { uniqueId: string, customName?: string }[] }[] = []
    for (const room of Array.isArray(layout)
      ? layout
      : []) {
      const services = (Array.isArray(room?.services)
        ? room.services
        : [])
        .filter(s => typeof s?.uniqueId === 'string' && allowed.has(s.uniqueId))
        .map(s => (typeof s.customName === 'string'
          ? { uniqueId: s.uniqueId, customName: s.customName }
          : { uniqueId: s.uniqueId }))
      if (services.length) {
        rooms.push({
          name: String(room.name ?? ''),
          services,
        })
      }
    }
    return {
      device: {
        id: device.id,
        name: device.name,
        scopeLabel: device.scopeLabel,
        allowSensitive: device.allowSensitive,
      },
      rooms,
    }
  }

  registerSocket(deviceId: string, socket: Socket) {
    let set = this.sockets.get(deviceId)
    if (!set) {
      set = new Set()
      this.sockets.set(deviceId, set)
    }
    set.add(socket)
  }

  unregisterSocket(deviceId: string, socket: Socket) {
    const set = this.sockets.get(deviceId)
    set?.delete(socket)
    if (set && set.size === 0) {
      this.sockets.delete(deviceId)
    }
  }

  disconnectDevice(deviceId: string) {
    const set = this.sockets.get(deviceId)
    this.sockets.delete(deviceId)
    for (const socket of set ?? []) {
      try {
        socket.disconnect(true)
      } catch {
        // already gone
      }
    }
  }
}
