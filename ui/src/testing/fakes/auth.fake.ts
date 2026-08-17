import type { UserInterface } from '@/app/core/auth/auth.interfaces'
import type { AuthService } from '@/app/core/auth/auth.service'

import { vi } from 'vitest'

import { TEST_INSTANCE_ID } from '../constants'

export type FakeAuth = AuthService & { user: UserInterface, token: string | null }

export interface MakeAuthOverrides extends Partial<Omit<FakeAuth, 'user'>> {
  user?: Partial<UserInterface>
}

/**
 * A stand-in for AuthService.
 *
 * Deliberately a plain mutable object rather than a frozen stub: AuthHelperService
 * writes `token` and `user` back onto the service, and specs for the login and
 * guard paths do the same to move between signed-in and signed-out states.
 *
 * `tokenReady` must always be an already-resolved promise. Guards await it
 * before deciding anything, so a pending one hangs the spec rather than
 * failing it.
 * @param overrides - fields to change; `user` is merged over the defaults
 */
export function makeAuth(overrides: MakeAuthOverrides = {}): FakeAuth {
  const { user: userOverrides, ...rest } = overrides

  const auth = {
    token: 'test-access-token',
    user: {
      username: 'admin',
      name: 'Test Admin',
      admin: true,
      instanceId: TEST_INSTANCE_ID,
      ...userOverrides,
    },
    tokenReady: Promise.resolve(),

    isLoggedIn: vi.fn(() => Boolean(auth.token)),
    login: vi.fn(async () => undefined),
    noauth: vi.fn(async () => undefined),
    logout: vi.fn(),
    loadToken: vi.fn(async () => undefined),
    checkToken: vi.fn(async () => undefined),
    refreshSession: vi.fn(async () => undefined),
    checkAndRefreshIfNeeded: vi.fn(async () => undefined),
  } as unknown as FakeAuth

  return Object.assign(auth, rest)
}
