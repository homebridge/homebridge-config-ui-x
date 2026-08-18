import type { FakeApi, FakeSettings } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { JwtHelperService } from '@auth0/angular-jwt'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthService } from '@/app/core/auth/auth.service'
import { getStoredToken } from '@/app/core/auth/token-store'
import { NotificationService } from '@/app/core/communication/notification.service'
import { fakeApi, locationReload, makeSettings, TEST_INSTANCE_ID } from '@/testing'
import { provideFakes } from '@/testing/providers'

/**
 * Real JSON web tokens, so the spec exercises the same decode and expiry path
 * as production rather than a stubbed helper that always agrees.
 * @param payload - the claims to put in the token
 * @param expiresInSeconds - lifetime; pass a negative number for an expired token
 */
function makeJwt(payload: Record<string, any> = {}, expiresInSeconds = 3600): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({
      username: 'admin',
      name: 'Test Admin',
      admin: true,
      instanceId: TEST_INSTANCE_ID,
      ...payload,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    }),
    'signature',
  ].join('.')
}

describe('AuthService', () => {
  let api: FakeApi
  let settings: FakeSettings

  /**
   * Build the service. The constructor immediately exchanges the refresh
   * cookie for a token, so a spec that wants to start signed out registers a
   * failure for `/auth/session` before calling this.
   * @param overrides - settings fields the spec cares about
   */
  async function create(overrides: Record<string, any> = {}): Promise<AuthService> {
    settings = makeSettings(overrides)
    TestBed.configureTestingModule({
      providers: [
        { provide: JwtHelperService, useValue: new JwtHelperService() },
        provideFakes({ api, settings }),
      ],
    })
    const service = TestBed.inject(AuthService)
    await service.tokenReady
    return service
  }

  beforeEach(() => {
    api = fakeApi()
      .respond('post', '/auth/session', {})
      .respond('post', '/auth/logout', {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('signing in', () => {
    it('keeps the token and the decoded user', async () => {
      const service = await create()
      api.respond('post', '/auth/login', { access_token: makeJwt({ username: 'bwp91' }) })

      await service.login({ username: 'bwp91', password: 'secret' })

      expect(service.user.username).toBe('bwp91')
      expect(getStoredToken()).toBe(service.token)
    })

    it('re-reads the settings once signed in', async () => {
      const service = await create()
      api.respond('post', '/auth/login', { access_token: makeJwt() })

      await service.login({ username: 'admin', password: 'secret' })

      // An unauthenticated GET /auth/settings returns a reduced object, so the
      // whole session would run on the pre-login subset without this
      expect(settings.getAppSettings).toHaveBeenCalled()
    })

    it('rejects a token that is already expired', async () => {
      const service = await create()
      api.respond('post', '/auth/login', { access_token: makeJwt({}, -60) })

      await expect(service.login({ username: 'admin', password: 'secret' })).rejects.toThrow('Invalid username or password.')
    })
  })

  describe('restoring a session on page load', () => {
    it('exchanges the refresh cookie for a token', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt({ username: 'restored' }) })

      const service = await create()

      expect(service.user.username).toBe('restored')
      expect(api.lastCall('post', '/auth/session')?.options).toMatchObject({ withCredentials: true })
    })

    it('settles as signed out when there is no session', async () => {
      api.fail('post', '/auth/session', { status: 401 })

      // Not being signed in is the ordinary case, so this must resolve rather
      // than reject - the guards decide what happens next, and a rejection
      // here would block the whole boot
      const service = await create()

      expect(service.token).toBeNull()
    })
  })

  describe('a user still on the old two-factor secret', () => {
    it('raises the notification so the ui can prompt them to move over', async () => {
      // ⚠️ The old secret still works, so nothing else would tell the user their
      // second factor is on a format that is going away.
      //
      // ⚠️ Registered before `create()`: the token is read and decoded in the
      // constructor, so a response arranged afterwards is never seen
      api.respond('post', '/auth/session', { access_token: makeJwt({ otpLegacySecret: 'OLDSECRET' }) })

      await create()

      expect(TestBed.inject(NotificationService).legacyOtpDetected()).toBe(true)
    })

    it('says nothing for a user who has already moved over', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt() })

      await create()

      expect(TestBed.inject(NotificationService).legacyOtpDetected()).toBe(false)
    })
  })

  describe('isLoggedIn', () => {
    it('is true for a valid token from this instance', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      const service = await create()

      expect(service.isLoggedIn()).toBeTruthy()
    })

    it('is false when the token was issued by another homebridge instance', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt({ instanceId: 'a-different-instance' }) })
      const service = await create()

      expect(service.isLoggedIn()).toBe(false)
    })

    it('is false with no token at all', async () => {
      const service = await create()

      expect(service.isLoggedIn()).toBeFalsy()
    })
  })

  describe('logging out', () => {
    it('clears the session and reloads the page', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      const service = await create()

      service.logout()

      // Cleared synchronously: the server cleanup is best effort and must not
      // leave the ui signed in if it stalls
      expect(service.token).toBeNull()
      expect(getStoredToken()).toBeNull()
      expect(service.user).toEqual({})

      await vi.waitFor(() => expect(locationReload).toHaveBeenCalledTimes(1))
    })

    it('still reloads when the server cannot be reached', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      api.fail('post', '/auth/logout', new Error('offline'))
      const service = await create()

      service.logout()

      await vi.waitFor(() => expect(locationReload).toHaveBeenCalledTimes(1))
    })

    it('asks the server to clear the cookies', async () => {
      const service = await create()

      service.logout()

      // Without this the browser keeps a usable refresh cookie and the reload
      // silently restores the session the user just ended
      expect(api.lastCall('post', '/auth/logout')?.options).toMatchObject({ withCredentials: true })
    })
  })

  describe('checkToken', () => {
    it('logs out without asking the server when the token has expired', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt({}, 3600) })
      const service = await create()
      service.token = makeJwt({}, -60)

      await service.checkToken()

      expect(api.callsTo('get', '/auth/check')).toHaveLength(0)
      expect(service.token).toBeNull()
    })

    it('logs out and rethrows when the server rejects the token', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      api.fail('get', '/auth/check', { status: 401 })
      const service = await create()

      await expect(service.checkToken()).rejects.toEqual({ status: 401 })
      expect(service.token).toBeNull()
    })

    it('rethrows other failures without logging out', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      api.fail('get', '/auth/check', { status: 500 })
      const service = await create()

      await expect(service.checkToken()).rejects.toEqual({ status: 500 })
      // A server hiccup is not a reason to end the session
      expect(service.token).not.toBeNull()
    })
  })

  describe('refreshing the session', () => {
    it('re-decodes the user from the new token', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt({ admin: true }) })
      const service = await create()
      api.respond('post', '/auth/refresh', { access_token: makeJwt({ admin: false }) })

      await service.refreshSession('admin-guard')

      // Otherwise an admin who was just demoted keeps their admin menus until
      // the page is reloaded
      expect(service.user.admin).toBe(false)
    })

    it('sends the reason so the server log says why', async () => {
      const service = await create()
      api.respond('post', '/auth/refresh', { access_token: makeJwt() })

      await service.refreshSession('session-extension')

      expect(api.lastCall('post', '/auth/refresh')?.body).toEqual({ reason: 'session-extension' })
    })

    it('signs the user out when the new token is not usable', async () => {
      // ⚠️ Whatever came back is not a token this instance can read. Carrying on
      // would leave the app signed in against a token it cannot decode, so the
      // session is dropped and the failure passed to the caller
      const service = await create()
      api.respond('post', '/auth/refresh', { access_token: 'not-a-jwt-at-all' })

      await expect(service.refreshSession('admin-guard')).rejects.toThrow()
      expect(service.isLoggedIn()).toBe(false)
    })

    it('makes one request when called twice at once', async () => {
      const service = await create()
      let release: (value: any) => void = () => {}
      api.respond('post', '/auth/refresh', () => new Promise((resolve) => {
        release = resolve
      }))

      const first = service.refreshSession()
      const second = service.refreshSession()
      release({ access_token: makeJwt() })
      await Promise.all([first, second])

      expect(api.callsTo('post', '/auth/refresh')).toHaveLength(1)
    })
  })

  describe('a token that cannot be read at all', () => {
    it('settles signed out rather than throwing on page load', async () => {
      // ⚠️ Unlike a sign-in, a failed session restore must not throw: it runs from
      // the constructor, and a rejection there leaves the whole app unbootable
      // instead of showing the login page
      api.respond('post', '/auth/session', { access_token: 'header.not-valid-base64.signature' })

      const service = await create()

      expect(service.isLoggedIn()).toBe(false)
      expect(service.token).toBeNull()
    })

    it('refuses a sign-in whose token cannot be read', async () => {
      const service = await create()
      api.respond('post', '/auth/login', { access_token: 'header.not-valid-base64.signature' })

      await expect(service.login({ username: 'admin', password: 'x' })).rejects.toThrow()
      expect(service.isLoggedIn()).toBe(false)
    })
  })

  describe('the inactivity timer', () => {
    it('signs the user out when the session expires', async () => {
      vi.useFakeTimers()
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      const service = await create({ formAuth: true, sessionTimeout: 60 })

      await vi.advanceTimersByTimeAsync(60_000)

      expect(service.token).toBeNull()
    })

    it('asks the server for a local sign-out, not an account-wide one', async () => {
      // Since the server revokes every session on a normal logout, an idle tab
      // here would otherwise end the user's active sessions on every other
      // device. Nobody chose this logout, so it reaches only this browser.
      vi.useFakeTimers()
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      const service = await create({ formAuth: true, sessionTimeout: 60 })

      await vi.advanceTimersByTimeAsync(60_000)

      expect(service.token).toBeNull()
      expect(api.lastCall('post', '/auth/logout')?.body).toMatchObject({ scope: 'local' })
    })

    it('keeps a logout the user chose account-wide', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      const service = await create({ formAuth: true })

      service.logout()

      expect(api.lastCall('post', '/auth/logout')?.body ?? {}).not.toHaveProperty('scope')
    })

    it('quietly signs back in when the ui has no login', async () => {
      vi.useFakeTimers()
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      api.respond('post', '/auth/noauth', { access_token: makeJwt() })
      await create({ formAuth: false, sessionTimeout: 60 })

      await vi.advanceTimersByTimeAsync(60_000)

      expect(api.callsTo('post', '/auth/noauth')).toHaveLength(1)
      expect(locationReload).toHaveBeenCalledTimes(1)
    })

    it('gives up reloading after a few attempts in one session', async () => {
      vi.useFakeTimers()
      window.sessionStorage.setItem('uix.noauthReloadCount', '3')
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      api.respond('post', '/auth/noauth', { access_token: makeJwt() })
      await create({ formAuth: false, sessionTimeout: 60 })

      await vi.advanceTimersByTimeAsync(60_000)

      // The budget is what stops a bouncing server trapping the tab in an
      // endless reload loop
      expect(locationReload).not.toHaveBeenCalled()
    })

    it('clamps a session timeout that a browser timer cannot hold', async () => {
      vi.useFakeTimers()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      api.respond('post', '/auth/session', { access_token: makeJwt({}, 60 * 60 * 24 * 365) })

      // setTimeout takes a signed 32-bit millisecond count, so anything past
      // ~24.8 days silently never fires
      await create({ sessionTimeout: 60 * 60 * 24 * 30 })

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('clamped'))
    })
  })

  describe('extending the session on activity', () => {
    it('does nothing when inactivity based sessions are off', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      const service = await create({ formAuth: true, sessionTimeoutInactivityBased: false })

      await service.checkAndRefreshIfNeeded()

      expect(api.callsTo('post', '/auth/refresh')).toHaveLength(0)
    })

    it('does nothing when the ui has no login', async () => {
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      const service = await create({ formAuth: false, sessionTimeoutInactivityBased: true })

      await service.checkAndRefreshIfNeeded()

      expect(api.callsTo('post', '/auth/refresh')).toHaveLength(0)
    })

    it('waits until most of the session has passed', async () => {
      vi.useFakeTimers()
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      const service = await create({ formAuth: true, sessionTimeoutInactivityBased: true, sessionTimeout: 100 })
      api.respond('post', '/auth/refresh', { access_token: makeJwt() })

      // 69% through - still plenty of time left, so no request
      await vi.advanceTimersByTimeAsync(69_000)
      await service.checkAndRefreshIfNeeded()
      expect(api.callsTo('post', '/auth/refresh')).toHaveLength(0)

      // past 70%, so the session is topped up
      await vi.advanceTimersByTimeAsync(2_000)
      await service.checkAndRefreshIfNeeded()
      expect(api.callsTo('post', '/auth/refresh')).toHaveLength(1)
    })

    it('survives a failed refresh', async () => {
      vi.useFakeTimers()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      api.respond('post', '/auth/session', { access_token: makeJwt() })
      const service = await create({ formAuth: true, sessionTimeoutInactivityBased: true, sessionTimeout: 100 })
      api.fail('post', '/auth/refresh', new Error('offline'))

      await vi.advanceTimersByTimeAsync(71_000)

      // The user is signed out by the timer if this keeps failing, which is
      // the intended fallback - it must not throw at the call site
      await expect(service.checkAndRefreshIfNeeded()).resolves.toBeUndefined()
    })
  })
})
