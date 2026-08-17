import type { FakeApi, FakeAuth } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NotificationService } from '@/app/core/communication/notification.service'
import { USER_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { Users2faDisableComponent } from '@/app/modules/users/users-2fa-disable/users-2fa-disable.component'
import { Users2faEnableComponent } from '@/app/modules/users/users-2fa-enable/users-2fa-enable.component'
import { activeModalStub, fakeApi, makeAuth, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * Turning two factor authentication on and off.
 *
 * The enable modal has one rule that is not obvious and matters a lot: a
 * time-based code is derived from the clock, so if the server's clock is out by
 * more than a few seconds every code the user's app produces will be rejected.
 * Rather than let them set it up and then be locked out, the modal refuses to
 * show the QR code at all and explains the drift instead.
 */
describe('two factor authentication modals', () => {
  let api: FakeApi
  let auth: FakeAuth
  let toastr: ReturnType<typeof toastrStub>
  let activeModal: ReturnType<typeof activeModalStub>
  let notification: NotificationService
  let writeText: ReturnType<typeof vi.fn>

  const otpauth = 'otpauth://totp/Homebridge:admin?secret=JBSWY3DPEHPK3PXP&issuer=Homebridge'

  /**
   * A timestamp the given number of milliseconds away from now, as the server
   * would report its own clock.
   * @param offsetMs - how far ahead of the browser the server claims to be
   */
  function serverTime(offsetMs = 0): string {
    return new Date(Date.now() + offsetMs).toISOString()
  }

  /**
   * Build one of the two modals.
   *
   * `arrange` runs before the component is created, which is the only window
   * for the enable modal's setup request.
   * @param type - the modal component
   * @param arrange - registers responses on the freshly built fakes
   */
  async function open<T>(type: new (...args: any[]) => T, arrange?: () => void): Promise<T> {
    TestBed.resetTestingModule()
    api = fakeApi().respond('post', '/users/otp/setup', { otpauth, timestamp: serverTime() })
    auth = makeAuth()
    toastr = toastrStub()
    activeModal = activeModalStub()

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ api, auth, settings: makeSettings(), toastr, activeModal }),
        { provide: USER_MODAL_DATA, useValue: { user: { id: 1, username: 'admin', admin: true } } },
      ],
    })

    notification = TestBed.inject(NotificationService)
    arrange?.()

    const fixture = TestBed.createComponent(type as any)
    fixture.detectChanges()
    await fixture.whenStable()
    return fixture.componentInstance as T
  }

  beforeEach(() => {
    // jsdom has no clipboard at all, and the async clipboard API is not
    // writable through a plain assignment
    writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('turning it on', () => {
    it('asks the server for a new secret', async () => {
      const modal = await open(Users2faEnableComponent)

      expect(api.lastCall('post', '/users/otp/setup')?.body).toEqual({})
      expect(modal.otpString()).toBe(otpauth)
    })

    it('pulls the shared secret out of the otpauth url', async () => {
      const modal = await open(Users2faEnableComponent)

      // Shown as text so a user whose authenticator cannot scan a QR code can
      // still type it in
      expect(modal.otpSecret()).toBe('JBSWY3DPEHPK3PXP')
    })

    it('accepts a clock within a few seconds', async () => {
      const modal = await open(Users2faEnableComponent, () =>
        api.respond('post', '/users/otp/setup', { otpauth, timestamp: serverTime(2000) }))

      expect(modal.timeDiffError()).toBeNull()
      expect(modal.otpString()).toBe(otpauth)
    })

    it('refuses to set up against a server clock that is ahead', async () => {
      const modal = await open(Users2faEnableComponent, () =>
        api.respond('post', '/users/otp/setup', { otpauth, timestamp: serverTime(60_000) }))

      // No QR code and no secret: every code generated from this secret would
      // be rejected, and the user would have locked themselves out
      expect(modal.timeDiffError()).not.toBeNull()
      expect(modal.otpString()).toBeUndefined()
      expect(modal.otpSecret()).toBeUndefined()
    })

    it('refuses to set up against a server clock that is behind', async () => {
      const modal = await open(Users2faEnableComponent, () =>
        api.respond('post', '/users/otp/setup', { otpauth, timestamp: serverTime(-60_000) }))

      // Drift in either direction breaks the codes, so both signs count
      expect(modal.timeDiffError()).not.toBeNull()
      expect(modal.otpString()).toBeUndefined()
    })

    it('closes itself when the secret cannot be generated', async () => {
      const modal = await open(Users2faEnableComponent, () =>
        api.fail('post', '/users/otp/setup', new Error('otp already active')))

      expect(activeModal.dismiss).toHaveBeenCalled()
      expect(toastr.at('error')[0].message).toBe('users.setup_2fa_enable_error')
      expect(modal.otpString()).toBeUndefined()
    })

    it('needs a six digit code before it will activate', async () => {
      const modal = await open(Users2faEnableComponent)

      modal.formGroup.patchValue({ code: '123' })
      expect(modal.formGroup.valid).toBe(false)

      modal.formGroup.patchValue({ code: '1234567' })
      expect(modal.formGroup.valid).toBe(false)

      modal.formGroup.patchValue({ code: '123456' })
      expect(modal.formGroup.valid).toBe(true)
    })

    it('sends the code to activate and closes', async () => {
      const modal = await open(Users2faEnableComponent)
      modal.formGroup.patchValue({ code: '123456' })

      await modal.enable2fa()

      expect(api.lastCall('post', '/users/otp/activate')?.body).toEqual({ code: '123456' })
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('stays open when the code is wrong', async () => {
      const modal = await open(Users2faEnableComponent, () =>
        api.fail('post', '/users/otp/activate', new Error('invalid code')))
      modal.formGroup.patchValue({ code: '000000' })

      await modal.enable2fa()

      // The secret is not active yet, so the user has to be able to try again
      // rather than be sent away and have to start over
      expect(activeModal.close).not.toHaveBeenCalled()
      expect(toastr.at('error')[0].message).toBe('users.setup_2fa_activate_error')
    })

    it('copies the secret and says so briefly', async () => {
      vi.useFakeTimers()
      const modal = await open(Users2faEnableComponent)

      await modal.copySecretToClipboard()

      expect(writeText).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP')
      expect(modal.secretCopied()).toBe(true)

      await vi.advanceTimersByTimeAsync(3000)
      expect(modal.secretCopied()).toBe(false)
    })

    it('restarts the copied message on a second press', async () => {
      vi.useFakeTimers()
      const modal = await open(Users2faEnableComponent)

      await modal.copySecretToClipboard()
      await vi.advanceTimersByTimeAsync(2000)
      await modal.copySecretToClipboard()
      await vi.advanceTimersByTimeAsync(2000)

      // The first timer is cleared, so the message lasts three seconds from the
      // last press rather than disappearing part way through
      expect(modal.secretCopied()).toBe(true)
    })

    it('copies nothing when there is no secret to copy', async () => {
      const modal = await open(Users2faEnableComponent, () =>
        api.respond('post', '/users/otp/setup', { otpauth, timestamp: serverTime(60_000) }))

      await modal.copySecretToClipboard()

      expect(writeText).not.toHaveBeenCalled()
    })
  })

  describe('turning it off', () => {
    it('sends the password and closes on success', async () => {
      const modal = await open(Users2faDisableComponent)
      modal.formGroup.patchValue({ password: 'correct horse' })

      await modal.disable2fa()

      expect(api.lastCall('post', '/users/otp/deactivate')?.body).toEqual({ password: 'correct horse' })
      expect(activeModal.close).toHaveBeenCalled()
      expect(toastr.at('success')[0].message).toBe('users.setup_2fa_disable_success')
    })

    it('needs a password', async () => {
      const modal = await open(Users2faDisableComponent)

      expect(modal.formGroup.valid).toBe(false)

      modal.formGroup.patchValue({ password: 'anything' })
      expect(modal.formGroup.valid).toBe(true)
    })

    it('clears the legacy warning it was raised by', async () => {
      const modal = await open(Users2faDisableComponent)
      notification.legacyOtpDetected.set(true)
      modal.formGroup.patchValue({ password: 'correct horse' })

      await modal.disable2fa()

      // This modal is how a user acts on the legacy-secret warning, so leaving
      // it up afterwards would tell them to do something already done
      expect(notification.legacyOtpDetected()).toBe(false)
    })

    it('refreshes the session so the token loses the legacy flag', async () => {
      const modal = await open(Users2faDisableComponent)
      modal.formGroup.patchValue({ password: 'correct horse' })

      await modal.disable2fa()

      expect(auth.refreshSession).toHaveBeenCalledWith('profile-update')
    })

    it('still counts as done when the session refresh fails', async () => {
      const modal = await open(Users2faDisableComponent, () => {
        auth.refreshSession = vi.fn(async () => Promise.reject(new Error('offline'))) as any
      })
      modal.formGroup.patchValue({ password: 'correct horse' })

      await modal.disable2fa()

      // Two factor really is off on the server by now; the stale flag in the
      // token clears itself at the next login
      expect(activeModal.close).toHaveBeenCalled()
      expect(modal.invalidCredentials()).toBe(false)
    })

    it('empties the password box when it is rejected', async () => {
      const modal = await open(Users2faDisableComponent, () =>
        api.fail('post', '/users/otp/deactivate', new Error('wrong password')))
      modal.formGroup.patchValue({ password: 'wrong' })

      await modal.disable2fa()

      // Turning two factor off is a security downgrade, so a wrong password
      // must not be left in the box for a second casual press of the button
      expect(modal.formGroup.value.password).toBe('')
      expect(modal.invalidCredentials()).toBe(true)
      expect(activeModal.close).not.toHaveBeenCalled()
    })

    it('clears the previous failure when trying again', async () => {
      const modal = await open(Users2faDisableComponent, () =>
        api.fail('post', '/users/otp/deactivate', new Error('wrong password')))
      modal.formGroup.patchValue({ password: 'wrong' })
      await modal.disable2fa()

      api.respond('post', '/users/otp/deactivate', undefined)
      modal.formGroup.patchValue({ password: 'correct horse' })
      await modal.disable2fa()

      expect(modal.invalidCredentials()).toBe(false)
      expect(activeModal.close).toHaveBeenCalled()
    })
  })
})
