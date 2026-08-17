import type { FakeAuth, FakeIoNamespace, FakeModalService, FakeSettings, FakeWs } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { CONFIRM_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { LayoutComponent } from '@/app/shared/layout/layout.component'
import { environment } from '@/environments/environment'
import { fakeWs, makeAuth, makeSettings, modalServiceSpy } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The application shell.
 *
 * It draws almost nothing itself, but it owns two things that have caused real
 * outages. The first is what happens when the websocket reconnects: a rolling
 * restart makes the socket flap several times in a few seconds, and each flap
 * used to re-check the token against a backend that was still starting up. The
 * 401s that came back reload the page, the fresh socket reconnects immediately,
 * and the loop feeds itself - so reconnect checks are throttled.
 *
 * The second is the reconnect listener itself. The `app` namespace is cached and
 * shared, so a layout that is torn down without detaching leaves its handler
 * behind; logging out and back in would then check the token twice per
 * reconnect, three times after the next one, and so on.
 */
describe('layoutComponent', () => {
  let auth: FakeAuth
  let settings: FakeSettings
  let ws: FakeWs
  let io: FakeIoNamespace
  let modal: FakeModalService
  let navigate: ReturnType<typeof vi.fn>

  /**
   * Build the shell.
   * @param options - how to set it up
   * @param options.uiVersion - the version the server reports for itself
   * @param options.url - the current router url
   * @param options.settingsLoaded - whether /auth/settings has answered yet
   * @param options.onSettingsLoaded - the settings-loaded stream to use
   */
  async function open(options: {
    uiVersion?: string
    url?: string
    settingsLoaded?: boolean
    onSettingsLoaded?: Subject<void>
  } = {}) {
    TestBed.resetTestingModule()
    auth = makeAuth()
    settings = makeSettings({
      // Matching the bundled version is the ordinary case: no mismatch, no modal
      uiVersion: options.uiVersion ?? environment.serverTarget,
      ...(options.settingsLoaded === false ? { settingsLoaded: false } : {}),
      ...(options.onSettingsLoaded ? { onSettingsLoaded: options.onSettingsLoaded } : {}),
    } as any)
    ws = fakeWs()
    io = ws.namespace('app')
    modal = modalServiceSpy()

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ auth, settings, ws, modal }),
      ],
    })

    // The sidebar and the routed page are each tested on their own
    TestBed.overrideComponent(LayoutComponent, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } })

    const router = TestBed.inject(Router)
    navigate = vi.fn(async () => true)
    vi.spyOn(router, 'navigate').mockImplementation(navigate as any)
    vi.spyOn(router, 'url', 'get').mockReturnValue(options.url ?? '/')

    const fixture = TestBed.createComponent(LayoutComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }

    return fixture.componentInstance
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the shared socket', () => {
    it('opens the app namespace', async () => {
      await open()

      expect(ws.connectToNamespace).toHaveBeenCalledWith('app')
    })

    it('re-checks the token when the socket comes back', async () => {
      await open()

      io.socket.fire('reconnect')

      // The server may have restarted, so the token this page is holding might
      // no longer be one it will accept
      expect(auth.checkToken).toHaveBeenCalledTimes(1)
    })

    it('ignores a flapping socket for five seconds', async () => {
      await open()

      io.socket.fire('reconnect')
      await vi.advanceTimersByTimeAsync(1000)
      io.socket.fire('reconnect')
      await vi.advanceTimersByTimeAsync(1000)
      io.socket.fire('reconnect')

      // A rolling restart flaps the socket repeatedly; one check per flap meant
      // a burst of 401s, and each 401 reloads the page
      expect(auth.checkToken).toHaveBeenCalledTimes(1)
    })

    it('checks again once the cooldown has passed', async () => {
      await open()

      io.socket.fire('reconnect')
      await vi.advanceTimersByTimeAsync(5001)
      io.socket.fire('reconnect')

      // A genuine reconnect minutes later still has to be checked, so this is a
      // throttle rather than a one-shot
      expect(auth.checkToken).toHaveBeenCalledTimes(2)
    })

    it('detaches its listener when the shell is replaced', async () => {
      await open()
      expect(io.socket.handlers('reconnect')).toHaveLength(1)

      TestBed.resetTestingModule()

      // Logging out and back in mounts a fresh shell; a leftover handler would
      // make every future reconnect check the token twice
      expect(io.socket.handlers('reconnect')).toHaveLength(0)
    })

    it('does not check the token after teardown', async () => {
      await open()

      TestBed.resetTestingModule()
      io.socket.fire('reconnect')

      expect(auth.checkToken).not.toHaveBeenCalled()
    })

    it('closes the namespace it opened', async () => {
      await open()

      TestBed.resetTestingModule()

      expect(io.end).toHaveBeenCalled()
    })
  })

  describe('a server running older code than the page', () => {
    it('says nothing when the versions match', async () => {
      await open()

      expect(modal.opened).toHaveLength(0)
    })

    it('asks the user to restart when the server is behind', async () => {
      await open({ uiVersion: '1.0.0' })

      // The bundled page was served by a newer install than the process now
      // answering it, which means the service was updated but never restarted
      expect(modal.lastOpened()?.content).toBe(ConfirmComponent)
      expect(modal.dataFor(CONFIRM_MODAL_DATA)?.title).toBe('platform.version.service_restart_required')
    })

    it('says nothing when the server is somehow ahead', async () => {
      await open({ uiVersion: '99.0.0' })

      // Only an out-of-date server is a problem; a newer one serves its own page
      expect(modal.opened).toHaveLength(0)
    })

    it('refuses to be dismissed with the keyboard', async () => {
      await open({ uiVersion: '1.0.0' })

      // Escaping this leaves the user in a half-broken UI with no explanation
      expect(modal.lastOpened()?.options?.keyboard).toBe(false)
      expect(modal.lastOpened()?.options?.backdrop).toBe('static')
    })

    it('sends the user to restart when they agree', async () => {
      await open({ uiVersion: '1.0.0' })

      modal.lastOpened()!.ref.close()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      expect(navigate).toHaveBeenCalledWith(['/restart'])
    })

    it('leaves the user where they are when they decline', async () => {
      await open({ uiVersion: '1.0.0' })

      modal.lastOpened()!.ref.dismiss('Dismiss')
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      expect(navigate).not.toHaveBeenCalled()
    })

    it('stays quiet on the restart page itself', async () => {
      await open({ uiVersion: '1.0.0', url: '/restart' })

      // The user is already doing the thing the modal would ask for, and it
      // would sit on top of the progress they are watching
      expect(modal.opened).toHaveLength(0)
    })

    it('waits for the settings before comparing anything', async () => {
      const onSettingsLoaded = new Subject<void>()
      await open({ uiVersion: '1.0.0', settingsLoaded: false, onSettingsLoaded })

      // The shell renders before /auth/settings answers, and the version is not
      // known until it does
      expect(modal.opened).toHaveLength(0)

      onSettingsLoaded.next()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      expect(modal.lastOpened()?.content).toBe(ConfirmComponent)
    })
  })

  describe('the sidebar', () => {
    it('starts collapsed', async () => {
      const layout = await open()

      expect(layout.sidebarExpanded()).toBe(false)
    })
  })
})
