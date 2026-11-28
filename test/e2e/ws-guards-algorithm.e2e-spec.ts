import type { ExecutionContext } from '@nestjs/common'

import { JwtService } from '@nestjs/jwt'
import { WsException } from '@nestjs/websockets'
import { describe, expect, it, vi } from 'vitest'

import { WsAdminGuard } from '../../src/core/auth/guards/ws-admin-guard.js'
import { WsLogGuard } from '../../src/core/auth/guards/ws-log.guard.js'
import { WsGuard } from '../../src/core/auth/guards/ws.guard.js'

// The guards only need AuthService and ConfigService through injection, and both are stubbed below,
// so keep the real (large) modules out of this spec.
vi.mock('../../src/core/auth/auth.service.js', () => ({ AuthService: class AuthService {} }))
vi.mock('../../src/core/config/config.service.js', () => ({ ConfigService: class ConfigService {} }))

/**
 * The websocket guards must accept only the algorithm the sessions are signed with.
 *
 * `AuthModule` registers `JwtModule` with a plain secret and no `algorithm`, so `JwtService.sign()`
 * produces HS256. Without an `algorithms` list, `jwt.verify` accepts every HMAC algorithm
 * (HS256, HS384 and HS512), so a token signed with the same secret using HS512 was accepted too.
 *
 * This drives each guard's `canActivate` with a stub `ConfigService` and `AuthService` instead of a
 * full socket.io app: the check is a single `jwt.verify` call at the top of each guard, and a socket
 * round trip would need the whole application context to exercise nothing else.
 */
const SECRET = 'a-test-secret-key-for-ws-guard-algorithm'
const INSTANCE_ID = 'test-instance'

const payload = {
  username: 'admin',
  name: 'Admin',
  admin: true,
  instanceId: INSTANCE_ID,
}
const jwtService = new JwtService({ secret: SECRET })

function makeClient(token: string) {
  return {
    handshake: {
      auth: { token },
    },
    disconnect: vi.fn(),
  }
}

function makeContext(client: ReturnType<typeof makeClient>) {
  return {
    switchToWs: () => ({
      getClient: () => client,
    }),
  } as unknown as ExecutionContext
}

function makeGuard(Guard: any) {
  const configService = {
    secrets: { secretKey: SECRET },
    instanceId: INSTANCE_ID,
    setupWizardComplete: true,
    restrictLogsToAdmins: false,
  }
  const authService = {
    validateUser: vi.fn(async () => true),
    trackSocket: vi.fn(),
  }
  const moduleRef = {
    get: vi.fn(() => authService),
  }
  return new Guard(configService, moduleRef)
}

describe.each([
  ['WsGuard', WsGuard],
  ['WsAdminGuard', WsAdminGuard],
  ['WsLogGuard', WsLogGuard],
])('%s token algorithm', (_name, Guard) => {
  it('accepts a token signed with HS256, the algorithm JwtService signs with', async () => {
    const client = makeClient(jwtService.sign(payload))

    await expect(makeGuard(Guard).canActivate(makeContext(client))).resolves.toBe(true)
    expect(client.disconnect).not.toHaveBeenCalled()
  })

  it('rejects a token signed with HS512 and the same secret', async () => {
    const client = makeClient(jwtService.sign(payload, { algorithm: 'HS512' }))

    await expect(makeGuard(Guard).canActivate(makeContext(client))).rejects.toThrow(WsException)
    expect(client.disconnect).toHaveBeenCalledOnce()
  })
})
