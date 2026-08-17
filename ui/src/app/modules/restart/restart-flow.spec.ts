import type { FakeApi, FakeIoNamespace, FakeSettings, FakeWs } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TtlCacheService } from '@/app/core/caching/ttl-cache.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { PowerOptionsComponent } from '@/app/modules/power-options/power-options.component'
import { RestartComponent } from '@/app/modules/restart/restart.component'
import { fakeApi, fakeWs, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * Restarting Homebridge, and the menu that offers the various ways to do it.
 *
 * The restart page is the only screen in the app that has to keep working while
 * the server it is talking to disappears. It cannot poll, because the UI itself
 * may be restarting too, so it waits for the socket to come back and for a
 * status event to say Homebridge is up.
 *
 * The two timings are load-bearing and not obvious: nothing is believed for the
 * first seven seconds (Homebridge has not begun shutting down yet, so a status
 * event in that window is the *old* process saying it is fine), and after forty
 * seconds the user is warned and offered the logs.
 */
describe('restarting homebridge', () => {
  let api: FakeApi
  let settings: FakeSettings
  let toastr: ReturnType<typeof toastrStub>
  let ws: FakeWs
  let io: FakeIoNamespace
  let cache: { invalidateAll: ReturnType<typeof vi.fn> }
  let modal: ReturnType<typeof modalServiceSpy>
  let navigate: ReturnType<typeof vi.fn>

  /**
   * Build a page.
   * @param type - the page component
   * @param options - how to set the page up
   * @param options.url - the router url, so query params can be read
   * @param options.env - settings env overrides
   * @param options.arrange - registers responses on the freshly built fakes
   */
  async function open<T>(type: new (...args: any[]) => T, options: {
    url?: string
    env?: Record<string, any>
    arrange?: () => void
  } = {}): Promise<T> {
    TestBed.resetTestingModule()
    api = fakeApi().respond('put', '/server/restart', { restartingUI: false })
    settings = makeSettings({ env: options.env })
    toastr = toastrStub()
    ws = fakeWs()
    io = ws.namespace('status')
    cache = { invalidateAll: vi.fn() }
    modal = modalServiceSpy()

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ api, settings, toastr, ws, modal }),
        { provide: TtlCacheService, useValue: cache },
      ],
    })

    const router = TestBed.inject(Router)
    navigate = vi.fn(async () => true)
    vi.spyOn(router, 'navigate').mockImplementation(navigate as any)
    if (options.url) {
      vi.spyOn(router, 'url', 'get').mockReturnValue(options.url)
    }

    options.arrange?.()

    const fixture = TestBed.createComponent(type as any)
    fixture.detectChanges()
    await fixture.whenStable()

    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }

    return fixture.componentInstance as T
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the restart page', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('asks the server to restart itself', async () => {
      const page = await open(RestartComponent)

      expect(api.lastCall('put', '/server/restart')?.body).toEqual({})
      expect(page.error()).toBe(false)
    })

    it('throws away every cached response', async () => {
      await open(RestartComponent)

      // Plugins, pairings, accessories - all of it describes a process that is
      // about to be replaced
      expect(cache.invalidateAll).toHaveBeenCalled()
    })

    it('marks the ui as up straight away when only homebridge is restarting', async () => {
      const page = await open(RestartComponent)

      // The page it is running on is not going anywhere, so there is nothing to
      // wait for on that half
      expect(page.uiOnline()).toBe(true)
    })

    it('waits for the ui to come back when it is restarting too', async () => {
      const page = await open(RestartComponent, {
        arrange: () => api.respond('put', '/server/restart', { restartingUI: true }),
      })

      expect(page.uiOnline()).toBe(false)
      expect(page.uiIcon()).toBe('fas fa-circle-notch fa-spin')
    })

    it('skips the restart request when something else already started one', async () => {
      const page = await open(RestartComponent, { url: '/restart?restarting=true' })

      // Reached from the accessory-cache modals, which restart the server
      // themselves before sending the user here
      expect(api.callsTo('put', '/server/restart')).toHaveLength(0)
      expect(page.uiOnline()).toBe(true)
    })

    it('shows an error when the restart cannot be started', async () => {
      const page = await open(RestartComponent, {
        arrange: () => api.fail('put', '/server/restart', new Error('offline')),
      })

      expect(page.error()).toBe('restart.toast_server_restart_error')
      expect(toastr.at('error')).toHaveLength(1)
    })

    it('ignores a status event from the process that is still shutting down', async () => {
      const page = await open(RestartComponent)

      // Deliberately most of the way through the settling period rather than at
      // zero: at zero any shortening of the wait still looks like a pass
      await vi.advanceTimersByTimeAsync(6500)
      io.socket.fire('homebridge-status', { status: 'ok' })

      // Homebridge takes a moment to even begin stopping, so an 'ok' this early
      // is the old process answering and would send the user away too soon
      expect(navigate).not.toHaveBeenCalled()
      expect(page.uiOnline()).toBe(true)
    })

    it('believes a status event once the settling period is over', async () => {
      const page = await open(RestartComponent)
      await vi.advanceTimersByTimeAsync(7000)

      io.socket.fire('homebridge-status', { status: 'ok' })

      expect(toastr.at('success')[0].message).toBe('restart.toast_server_restarted')
      expect(navigate).toHaveBeenCalledWith(['/'])
      expect(page.uiOnline()).toBe(true)
    })

    it('treats a pending homebridge as up as well', async () => {
      await open(RestartComponent)
      await vi.advanceTimersByTimeAsync(7000)

      io.socket.fire('homebridge-status', { status: 'pending' })

      // 'pending' means the process is running and still loading plugins, which
      // is as far as this page needs it to get
      expect(navigate).toHaveBeenCalledWith(['/'])
    })

    it('keeps waiting while homebridge reports itself down', async () => {
      const page = await open(RestartComponent)
      await vi.advanceTimersByTimeAsync(7000)

      io.socket.fire('homebridge-status', { status: 'down' })

      expect(navigate).not.toHaveBeenCalled()
      // The event still proves the UI is answering, which is the first tick
      expect(page.uiOnline()).toBe(true)
    })

    it('only announces the restart once', async () => {
      await open(RestartComponent)
      await vi.advanceTimersByTimeAsync(7000)

      io.socket.fire('homebridge-status', { status: 'ok' })
      io.socket.fire('homebridge-status', { status: 'ok' })
      io.socket.fire('homebridge-status', { status: 'ok' })

      // Navigation is not instant, and a screen reader re-reads the toast each
      // time it is raised
      expect(toastr.at('success')).toHaveLength(1)
      expect(navigate).toHaveBeenCalledTimes(1)
    })

    it('asks again for the status in case the first event was missed', async () => {
      await open(RestartComponent)
      // One ask already, from the socket being connected when the page opened
      expect(io.socket.payloadsFor('monitor-server-status')).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(7000)

      // And a second when the settling period ends: a fast restart can finish
      // inside those seven seconds, and the event that proved it was
      // deliberately ignored, so the page has to ask rather than wait
      expect(io.socket.payloadsFor('monitor-server-status')).toHaveLength(2)
    })

    it('re-subscribes and reloads its settings when the socket reconnects', async () => {
      await open(RestartComponent)

      io.markConnected()

      // The socket was dropped by the restart, so the server has no idea this
      // page still wants status events
      expect(io.socket.emitted.some(entry => entry.event === 'monitor-server-status')).toBe(true)
      expect(settings.getAppSettings).toHaveBeenCalled()
    })

    it('warns the user and offers the logs when it takes too long', async () => {
      const page = await open(RestartComponent)

      await vi.advanceTimersByTimeAsync(40000)

      expect(page.timeout()).toBe(true)
      expect(toastr.at('warning')[0].message).toBe('restart.toast_server_restart_timeout')
      // Long enough to actually be read
      expect(toastr.at('warning')[0].config).toEqual({ timeOut: 10000 })
    })

    it('does not warn before the timeout is up', async () => {
      const page = await open(RestartComponent)

      await vi.advanceTimersByTimeAsync(39000)

      expect(page.timeout()).toBe(false)
      expect(toastr.at('warning')).toHaveLength(0)
    })

    it('sends the user to the logs on request', async () => {
      const page = await open(RestartComponent)

      page.viewLogs()

      expect(navigate).toHaveBeenCalledWith(['/logs'])
    })

    it('detaches its status listener when the user navigates away', async () => {
      await open(RestartComponent)
      expect(io.socket.handlers('homebridge-status')).toHaveLength(1)

      TestBed.resetTestingModule()

      // The status namespace is shared and cached, so a listener left behind
      // would keep toasting and navigating from whatever page comes next
      expect(io.socket.handlers('homebridge-status')).toHaveLength(0)
    })

    it('stops believing status events after teardown', async () => {
      await open(RestartComponent)
      await vi.advanceTimersByTimeAsync(7000)

      TestBed.resetTestingModule()
      io.socket.fire('homebridge-status', { status: 'ok' })

      expect(navigate).not.toHaveBeenCalled()
    })
  })

  describe('the power options menu', () => {
    it('sets the page title', async () => {
      await open(PowerOptionsComponent)

      expect(settings.setPageTitle).toHaveBeenCalledWith('menu.restart.title')
    })

    it('offers the host controls only when the platform supports them', async () => {
      expect((await open(PowerOptionsComponent)).canShutdownRestartHost()).toBe(false)
      expect((await open(PowerOptionsComponent, { env: { canShutdownRestartHost: true } })).canShutdownRestartHost()).toBe(true)
    })

    it('knows when it is running in a container', async () => {
      const page = await open(PowerOptionsComponent, { env: { runningInDocker: true } })

      // Restarting the container replaces both Homebridge and the UI, so it is a
      // different option from restarting the host
      expect(page.runningInDocker()).toBe(true)
    })

    it('restarts homebridge through the restart page', async () => {
      const page = await open(PowerOptionsComponent)

      page.restartHomebridge()

      expect(navigate).toHaveBeenCalledWith(['/restart'])
    })

    it('sets the full service flag before a service restart', async () => {
      const page = await open(PowerOptionsComponent)

      await page.restartHomebridgeService()

      // Without the flag hb-service does its in-process restart, which is not
      // what the user asked for
      expect(api.callsTo('put', '/platform-tools/hb-service/set-full-service-restart-flag')).toHaveLength(1)
      expect(navigate).toHaveBeenCalledWith(['/restart'])
    })

    it('stays put when the flag cannot be set', async () => {
      const page = await open(PowerOptionsComponent, {
        arrange: () => api.fail('put', '/platform-tools/hb-service/set-full-service-restart-flag', new Error('offline')),
      })

      await page.restartHomebridgeService()

      // Navigating anyway would show a restart page for a restart that never
      // started
      expect(navigate).not.toHaveBeenCalled()
      expect(toastr.at('error')).toHaveLength(1)
    })

    it('sends the host restart to its own page', async () => {
      const page = await open(PowerOptionsComponent, { env: { canShutdownRestartHost: true } })

      page.restartServer()

      expect(navigate).toHaveBeenCalledWith(['/platform-tools/linux/restart-server'])
    })

    it('sends a container restart to its own page', async () => {
      const page = await open(PowerOptionsComponent, { env: { runningInDocker: true } })

      page.dockerRestartContainer()

      expect(navigate).toHaveBeenCalledWith(['/platform-tools/docker/restart-container'])
    })

    it('asks before shutting the machine down', async () => {
      const page = await open(PowerOptionsComponent, { env: { canShutdownRestartHost: true } })

      const done = page.shutdownServer()

      // The only action here that needs someone to physically press a power
      // button afterwards
      expect(modal.lastOpened()?.content).toBe(ConfirmComponent)
      modal.lastOpened()!.ref.dismiss('Dismiss')
      await done
    })

    it('shuts down once confirmed', async () => {
      const page = await open(PowerOptionsComponent, { env: { canShutdownRestartHost: true } })

      const done = page.shutdownServer()
      modal.lastOpened()!.ref.close()
      await done

      expect(navigate).toHaveBeenCalledWith(['/platform-tools/linux/shutdown-server'])
    })

    it('does nothing when the shutdown is called off', async () => {
      const page = await open(PowerOptionsComponent, { env: { canShutdownRestartHost: true } })

      const done = page.shutdownServer()
      modal.lastOpened()!.ref.dismiss('Dismiss')
      await done

      expect(navigate).not.toHaveBeenCalled()
    })

    it('clears the pending-restart reminder whichever route is taken', async () => {
      const page = await open(PowerOptionsComponent)
      settings.restartToastRef = { toastId: 7 } as any

      page.restartHomebridge()

      // The user is acting on that reminder right now, so leaving it on screen
      // would tell them to do something they have just done
      expect(toastr.clear).toHaveBeenCalledWith(7)
      expect(settings.restartToastRef).toBeNull()
    })

    it('copes with there being no reminder to clear', async () => {
      const page = await open(PowerOptionsComponent)
      settings.restartToastRef = null

      page.restartHomebridge()

      expect(toastr.clear).not.toHaveBeenCalled()
      expect(navigate).toHaveBeenCalledWith(['/restart'])
    })
  })
})
