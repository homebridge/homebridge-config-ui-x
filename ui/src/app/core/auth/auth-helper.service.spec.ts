import type { FakeAuth } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { setStoredToken } from '@/app/core/auth/token-store'
import { makeAuth } from '@/testing'

/**
 * The single question every guard asks. It also tidies up: a token that has
 * gone or stopped being valid is cleared here, so the rest of the app does not
 * keep a half-signed-in state around.
 */
describe('AuthHelperService', () => {
  let auth: FakeAuth
  let service: AuthHelperService

  beforeEach(() => {
    auth = makeAuth()
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: auth }],
    })
    service = TestBed.inject(AuthHelperService)
  })

  it('confirms a signed-in user', async () => {
    setStoredToken('a-token')
    auth.isLoggedIn = vi.fn(() => true) as any

    await expect(service.isAuthenticated()).resolves.toBe(true)
  })

  it('reports a missing token and clears what is left behind', async () => {
    setStoredToken(null)

    await expect(service.isAuthenticated()).resolves.toBe(false)
    expect(auth.token).toBeNull()
    expect(auth.user).toEqual({})
  })

  it('clears the session when the token is no longer valid', async () => {
    setStoredToken('a-token')
    auth.isLoggedIn = vi.fn(() => false) as any

    await expect(service.isAuthenticated()).resolves.toBe(false)
    expect(auth.token).toBeNull()
    expect(auth.user).toEqual({})
  })

  it('signs the user out when the check itself fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setStoredToken('a-token')
    auth.isLoggedIn = vi.fn(() => {
      throw new Error('malformed token')
    }) as any

    await expect(service.isAuthenticated()).resolves.toBe(false)
    expect(auth.logout).toHaveBeenCalled()
  })
})
