import type { FakeAuth, FakeSettings, FakeToastr } from '@/testing'
import type { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router'
import type { Mock } from 'vitest'

import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { describe, expect, it, vi } from 'vitest'

import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { adminGuard } from '@/app/core/auth/guards/admin.guard'
import { authGuard } from '@/app/core/auth/guards/auth.guard'
import { loginGuard } from '@/app/core/auth/guards/login.guard'
import { logsGuard } from '@/app/core/auth/guards/logs.guard'
import { setupWizardGuard } from '@/app/core/auth/guards/setup-wizard.guard'
import { makeAuth, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The route guards are the app's permission surface, so each one's outcomes
 * are pinned here: what it allows, where it sends the user instead, and what
 * it remembers on the way.
 *
 * Two defaults keep these from hanging rather than failing: the settings fake
 * reports itself already loaded, and the auth fake's `tokenReady` is an
 * already-resolved promise. Every guard waits on both.
 */
describe('route guards', () => {
  let auth: FakeAuth
  let settings: FakeSettings
  let toastr: FakeToastr
  let isAuthenticated: Mock<() => Promise<boolean>>
  let navigate: Mock<(commands: any[]) => Promise<boolean>>

  const route = {} as ActivatedRouteSnapshot
  const state = { url: '/plugins' } as RouterStateSnapshot

  function configure(options: { authenticated?: boolean, settings?: Record<string, any>, auth?: Record<string, any> } = {}) {
    auth = makeAuth(options.auth)
    settings = makeSettings(options.settings)
    toastr = toastrStub()
    isAuthenticated = vi.fn(async () => options.authenticated ?? true)

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ auth, settings, toastr }),
        { provide: AuthHelperService, useValue: { isAuthenticated } },
      ],
    })

    navigate = vi.fn(async () => true)
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate as any)
  }

  function run(guard: CanActivateFn): Promise<boolean> {
    return TestBed.runInInjectionContext(() => guard(route, state) as Promise<boolean>)
  }

  describe('authGuard', () => {
    it('lets a signed-in user through', async () => {
      configure({ authenticated: true })

      await expect(run(authGuard)).resolves.toBe(true)
      expect(navigate).not.toHaveBeenCalled()
    })

    it('sends a signed-out user to the login page', async () => {
      configure({ authenticated: false })

      await expect(run(authGuard)).resolves.toBe(false)
      expect(navigate).toHaveBeenCalledWith(['/login'])
    })

    it('remembers where the user was heading', async () => {
      configure({ authenticated: false })

      await run(authGuard)

      // The login page reads this so the user lands where they meant to go
      expect(window.sessionStorage.getItem('target_route')).toBe('/plugins')
    })

    it('sends a fresh install to the setup wizard', async () => {
      configure({ settings: { env: { setupWizardComplete: false } } })

      await expect(run(authGuard)).resolves.toBe(false)
      expect(navigate).toHaveBeenCalledWith(['/setup'])
    })

    it('signs the user in silently when the ui has no login', async () => {
      configure({ settings: { formAuth: false } })

      await expect(run(authGuard)).resolves.toBe(true)
      expect(auth.noauth).toHaveBeenCalled()
    })

    it('tops up the session on the way through', async () => {
      configure({ authenticated: true })

      await run(authGuard)

      expect(auth.checkAndRefreshIfNeeded).toHaveBeenCalled()
    })
  })

  describe('adminGuard', () => {
    it('lets an admin through', async () => {
      configure({ authenticated: true, auth: { user: { admin: true } } })

      await expect(run(adminGuard)).resolves.toBe(true)
    })

    it('turns a non-admin away with a message', async () => {
      configure({ authenticated: true, auth: { user: { admin: false } } })

      await expect(run(adminGuard)).resolves.toBe(false)
      expect(navigate).toHaveBeenCalledWith(['/'])
      expect(toastr.at('error')[0]?.message).toBe('toast.no_auth')
    })

    it('checks with the server on every admin navigation', async () => {
      configure({ authenticated: true })

      await run(adminGuard)

      // The backend rejects the refresh when the user's admin flag changed,
      // so a demoted admin loses access within one navigation
      expect(auth.refreshSession).toHaveBeenCalledWith('admin-guard')
    })

    it('sends the user to login when that check is rejected', async () => {
      configure({ authenticated: true })
      auth.refreshSession = vi.fn(async () => {
        throw new Error('admin flag changed')
      }) as any

      await expect(run(adminGuard)).resolves.toBe(false)
      expect(navigate).toHaveBeenCalledWith(['/login'])
    })

    it('sends a signed-out user to the login page', async () => {
      configure({ authenticated: false })

      await expect(run(adminGuard)).resolves.toBe(false)
      expect(navigate).toHaveBeenCalledWith(['/login'])
    })
  })

  describe('loginGuard', () => {
    it('shows the login page to a signed-out user', async () => {
      configure()
      auth.isLoggedIn = vi.fn(() => false) as any

      await expect(run(loginGuard)).resolves.toBe(true)
    })

    it('sends an already signed-in user home', async () => {
      configure()
      auth.isLoggedIn = vi.fn(() => true) as any

      await expect(run(loginGuard)).resolves.toBe(false)
      expect(navigate).toHaveBeenCalledWith(['/'])
    })

    it('sends a fresh install to the setup wizard', async () => {
      configure({ settings: { env: { setupWizardComplete: false } } })

      await expect(run(loginGuard)).resolves.toBe(false)
      expect(navigate).toHaveBeenCalledWith(['/setup'])
    })

    it('has nothing to show when the ui has no login', async () => {
      configure({ settings: { formAuth: false } })
      auth.isLoggedIn = vi.fn(() => false) as any

      await expect(run(loginGuard)).resolves.toBe(false)
      expect(navigate).toHaveBeenCalledWith(['/'])
    })
  })

  describe('setupWizardGuard', () => {
    it('opens the wizard on a fresh install', async () => {
      configure({ settings: { env: { setupWizardComplete: false } } })

      await expect(run(setupWizardGuard)).resolves.toBe(true)
    })

    it('sends everyone else home', async () => {
      configure({ settings: { env: { setupWizardComplete: true } } })

      await expect(run(setupWizardGuard)).resolves.toBe(false)
      expect(navigate).toHaveBeenCalledWith(['/'])
    })
  })

  describe('logsGuard', () => {
    it('lets any signed-in user read the log by default', async () => {
      configure({ authenticated: true, settings: { env: { restrictLogsToAdmins: false } }, auth: { user: { admin: false } } })

      await expect(run(logsGuard)).resolves.toBe(true)
    })

    it('requires an admin once the log is restricted', async () => {
      configure({ authenticated: true, settings: { env: { restrictLogsToAdmins: true } }, auth: { user: { admin: false } } })

      await expect(run(logsGuard)).resolves.toBe(false)
      expect(navigate).toHaveBeenCalledWith(['/'])
    })

    it('still admits an admin when the log is restricted', async () => {
      configure({ authenticated: true, settings: { env: { restrictLogsToAdmins: true } }, auth: { user: { admin: true } } })

      await expect(run(logsGuard)).resolves.toBe(true)
    })

    it('reads the restriction only after the token has loaded', async () => {
      // `restrictLogsToAdmins` is only sent to an authorised caller, so the
      // flag is not there yet when the guard starts. Reading it any earlier
      // silently falls back to the permissive guard on every page load.
      let tokenLoaded: () => void = () => {}
      const tokenReady = new Promise<void>((resolve) => {
        tokenLoaded = resolve
      })
      configure({
        authenticated: true,
        settings: { env: { restrictLogsToAdmins: undefined } },
        auth: { user: { admin: false }, tokenReady },
      })

      const decision = run(logsGuard)
      settings.env.restrictLogsToAdmins = true
      tokenLoaded()

      await expect(decision).resolves.toBe(false)
      expect(navigate).toHaveBeenCalledWith(['/'])
    })

    it('runs the delegate inside an injection context', async () => {
      // The real delegates are used deliberately: they open with their own
      // inject() calls, and this guard has already awaited by the time it
      // calls them. Without runInInjectionContext this throws NG0203 and the
      // log viewer never loads.
      configure({ authenticated: true, settings: { env: { restrictLogsToAdmins: true } }, auth: { user: { admin: true } } })

      await expect(run(logsGuard)).resolves.not.toThrow()
      expect(auth.refreshSession).toHaveBeenCalledWith('admin-guard')
    })
  })
})
