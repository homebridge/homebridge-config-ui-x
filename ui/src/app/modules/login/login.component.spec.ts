import type { FakeAuth, FakeSettings } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LoginComponent } from '@/app/modules/login/login.component'
import { makeAuth, makeSettings, setMatchMedia } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The login page.
 *
 * Two things here are security decisions rather than presentation. A non-admin
 * who was sent to the login page from an admin-only route must not be returned
 * to it afterwards, and the route they were heading for is read out of session
 * storage and removed in the same breath, so an abandoned login cannot leave a
 * target behind for whoever logs in next.
 *
 * The rest is about the two ways a browser fills this form in: password
 * managers write straight to the DOM without telling Angular, so the native
 * input values are read back before the form is submitted.
 */
describe('loginComponent', () => {
  let auth: FakeAuth
  let settings: FakeSettings
  let navigateByUrl: ReturnType<typeof vi.fn>

  /**
   * Build the login page.
   * @param overrides - fakes to change
   * @param overrides.auth - the auth service fake
   * @param overrides.settings - the settings service fake
   */
  async function open(overrides: { auth?: FakeAuth, settings?: FakeSettings } = {}) {
    TestBed.resetTestingModule()
    auth = overrides.auth ?? makeAuth()
    settings = overrides.settings ?? makeSettings()

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ auth, settings }),
      ],
    })

    navigateByUrl = vi.fn(async () => true)
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(navigateByUrl as any)

    const fixture = TestBed.createComponent(LoginComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }

    return { fixture, page: fixture.componentInstance }
  }

  /**
   * An HTTP error as AuthService surfaces it.
   * @param status - the response status
   */
  function httpError(status: number) {
    return Object.assign(new Error(`HTTP ${status}`), { status })
  }

  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('signing in', () => {
    it('sends what the user typed', async () => {
      const { page } = await open()
      page.form.setValue({ username: 'admin', password: 'letmein', otp: '' })

      await page.onSubmit()

      expect(auth.login).toHaveBeenCalledWith({ username: 'admin', password: 'letmein', otp: '' })
      expect(page.inProgress()).toBe(false)
    })

    it('needs both a username and a password', async () => {
      const { page } = await open()
      expect(page.formInvalid()).toBe(true)

      page.form.setValue({ username: 'admin', password: '', otp: '' })
      expect(page.formInvalid()).toBe(true)

      page.form.setValue({ username: 'admin', password: 'letmein', otp: '' })
      expect(page.formInvalid()).toBe(false)
    })

    it('goes to the home page by default', async () => {
      const { page } = await open()
      page.form.setValue({ username: 'admin', password: 'letmein', otp: '' })

      await page.onSubmit()

      expect(navigateByUrl).toHaveBeenCalledWith('/')
    })

    it('returns an admin to the page they were trying to reach', async () => {
      window.sessionStorage.setItem('target_route', '/config')
      const { page } = await open()
      page.form.setValue({ username: 'admin', password: 'letmein', otp: '' })

      await page.onSubmit()

      expect(navigateByUrl).toHaveBeenCalledWith('/config')
    })

    it('forgets the target route as soon as it reads it', async () => {
      window.sessionStorage.setItem('target_route', '/config')
      await open()

      // Read and removed together, so abandoning this login cannot send the next
      // person who signs in to a page they never asked for
      expect(window.sessionStorage.getItem('target_route')).toBeNull()
    })

    it('sends a non-admin home instead of to an admin-only page', async () => {
      window.sessionStorage.setItem('target_route', '/config')
      const { page } = await open({ auth: makeAuth({ user: { admin: false } }) })
      page.form.setValue({ username: 'bob', password: 'letmein', otp: '' })

      await page.onSubmit()

      // The route guards would bounce them straight back here, which reads as a
      // failed login rather than a permission problem
      expect(navigateByUrl).toHaveBeenCalledWith('/')
    })

    it('lets a non-admin through to the pages they are allowed', async () => {
      for (const route of ['/accessories', '/plugins', '/logs', '/support']) {
        window.sessionStorage.setItem('target_route', route)
        const { page } = await open({ auth: makeAuth({ user: { admin: false } }) })
        page.form.setValue({ username: 'bob', password: 'letmein', otp: '' })

        await page.onSubmit()

        expect(navigateByUrl).toHaveBeenCalledWith(route)
      }
    })

    it('shows a failure without saying which half was wrong', async () => {
      const { page } = await open({ auth: makeAuth({ login: vi.fn(async () => Promise.reject(httpError(401))) as any }) })
      page.form.setValue({ username: 'admin', password: 'wrong', otp: '' })

      await page.onSubmit()

      expect(page.invalidCredentials()).toBe(true)
      expect(navigateByUrl).not.toHaveBeenCalled()
      expect(page.inProgress()).toBe(false)
    })

    it('clears a previous failure when trying again', async () => {
      const login = vi.fn(async (): Promise<void> => Promise.reject(httpError(401)))
      const { page } = await open({ auth: makeAuth({ login: login as any }) })
      page.form.setValue({ username: 'admin', password: 'wrong', otp: '' })
      await page.onSubmit()

      login.mockImplementation(async () => undefined)
      page.form.setValue({ username: 'admin', password: 'right', otp: '' })
      await page.onSubmit()

      expect(page.invalidCredentials()).toBe(false)
      expect(navigateByUrl).toHaveBeenCalled()
    })

    it('re-enables the button even when the request throws', async () => {
      const { page } = await open({ auth: makeAuth({ login: vi.fn(async () => Promise.reject(httpError(500))) as any }) })
      page.form.setValue({ username: 'admin', password: 'letmein', otp: '' })

      await page.onSubmit()

      // Otherwise a server error leaves the user staring at a spinner with no
      // way to retry
      expect(page.inProgress()).toBe(false)
    })
  })

  describe('two factor authentication', () => {
    it('asks for a code when the server says one is needed', async () => {
      const { page } = await open({ auth: makeAuth({ login: vi.fn(async () => Promise.reject(httpError(412))) as any }) })
      page.form.setValue({ username: 'admin', password: 'letmein', otp: '' })

      await page.onSubmit()

      // 412 means the password was right - this is not a failed login
      expect(page.twoFactorCodeRequired()).toBe(true)
      expect(page.invalidCredentials()).toBe(false)
    })

    it('starts requiring a six digit code once asked', async () => {
      const { page } = await open({ auth: makeAuth({ login: vi.fn(async () => Promise.reject(httpError(412))) as any }) })
      page.form.setValue({ username: 'admin', password: 'letmein', otp: '' })
      await page.onSubmit()

      // The field is optional until it appears, so the validators are added
      // rather than declared up front
      expect(page.formInvalid()).toBe(true)

      page.form.controls.otp.setValue('12345')
      expect(page.formInvalid()).toBe(true)

      page.form.controls.otp.setValue('123456')
      expect(page.formInvalid()).toBe(false)
    })

    it('marks the code as wrong on a second refusal', async () => {
      const { page } = await open({ auth: makeAuth({ login: vi.fn(async () => Promise.reject(httpError(412))) as any }) })
      page.form.setValue({ username: 'admin', password: 'letmein', otp: '' })
      await page.onSubmit()

      page.form.controls.otp.setValue('000000')
      await page.onSubmit()

      // The second 412 means the password is still fine but the code is not, so
      // the message has to point at the code rather than the password
      expect(page.invalid2faCode()).toBe(true)
      expect(page.invalidCredentials()).toBe(false)
      expect(page.form.controls.otp.errors).toEqual({ invalidCode: true })
    })

    it('sends the code with the next attempt', async () => {
      const login = vi.fn(async (): Promise<void> => Promise.reject(httpError(412)))
      const { page } = await open({ auth: makeAuth({ login: login as any }) })
      page.form.setValue({ username: 'admin', password: 'letmein', otp: '' })
      await page.onSubmit()

      login.mockImplementation(async () => undefined)
      page.form.controls.otp.setValue('123456')
      await page.onSubmit()

      expect(login).toHaveBeenLastCalledWith({ username: 'admin', password: 'letmein', otp: '123456' })
      expect(navigateByUrl).toHaveBeenCalled()
    })

    it('clears the wrong-code marker when trying again', async () => {
      const login = vi.fn(async (): Promise<void> => Promise.reject(httpError(412)))
      const { page } = await open({ auth: makeAuth({ login: login as any }) })
      page.form.setValue({ username: 'admin', password: 'letmein', otp: '' })
      await page.onSubmit()
      page.form.controls.otp.setValue('000000')
      await page.onSubmit()

      page.form.controls.otp.setValue('654321')
      await page.onSubmit()

      expect(page.invalid2faCode()).toBe(true)
      // Cleared at the start of each attempt, so it reflects this try rather
      // than accumulating
      expect(login).toHaveBeenCalledTimes(3)
    })
  })

  describe('what the browser filled in', () => {
    it('picks up a password written straight into the input', async () => {
      const { fixture, page } = await open()
      page.form.setValue({ username: 'admin', password: '', otp: '' })

      // A password manager sets the DOM value without going through Angular, so
      // the form control is still empty at this point
      const input = fixture.nativeElement.querySelector('#form-pass') as HTMLInputElement
      input.value = 'from-the-keychain'

      await page.onSubmit()

      expect(auth.login).toHaveBeenCalledWith(expect.objectContaining({ password: 'from-the-keychain' }))
    })

    it('picks up an autofilled username too', async () => {
      const { fixture, page } = await open()
      const input = fixture.nativeElement.querySelector('#form-username') as HTMLInputElement
      input.value = 'from-the-keychain'

      await page.onSubmit()

      expect(auth.login).toHaveBeenCalledWith(expect.objectContaining({ username: 'from-the-keychain' }))
    })

    it('prefers what the user typed over an empty input', async () => {
      const { page } = await open()
      page.form.setValue({ username: 'admin', password: 'typed-by-hand', otp: '' })

      await page.onSubmit()

      // Only a non-empty DOM value wins, or clearing the field by hand would be
      // undone by the stale control value
      expect(auth.login).toHaveBeenCalledWith(expect.objectContaining({ password: 'typed-by-hand' }))
    })
  })

  describe('the background', () => {
    it('uses the custom wallpaper when one is set', async () => {
      const { page } = await open({ settings: makeSettings({ env: { customWallpaperHash: 'abc123' } }) })

      expect(page.backgroundStyle()).toContain('/auth/wallpaper/abc123')
      expect(page.backgroundStyle()).toContain('center/cover')
    })

    it('stays plain when there is no wallpaper', async () => {
      const { page } = await open()

      expect(page.backgroundStyle()).toBe('')
    })

    it('waits for the settings before deciding', async () => {
      // The login page is often the first thing to render, before /auth/settings
      // has answered, so reading the hash too early would miss the wallpaper
      const { page } = await open({
        settings: makeSettings({ settingsLoaded: false, env: { customWallpaperHash: 'abc123' } }),
      })

      expect(page.backgroundStyle()).toContain('abc123')
    })
  })

  describe('focus', () => {
    it('puts the cursor in the username box on a desktop', async () => {
      const { fixture } = await open()

      expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#form-username'))
    })

    it('leaves the cursor alone on a touch device', async () => {
      setMatchMedia(true)
      const { fixture } = await open()

      // iOS will not open the keyboard without a gesture, so focusing here would
      // show a focus ring and nothing else
      expect(document.activeElement).not.toBe(fixture.nativeElement.querySelector('#form-username'))
    })
  })
})
