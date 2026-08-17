import type { FakeApi, FakeIoNamespace, FakeSettings, FakeWs } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, provideRouter, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { of } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileDetectService } from '@/app/core/utilities/mobile-detect.service'
import { ContainerRestartComponent } from '@/app/modules/platform-tools/docker/container-restart/container-restart.component'
import { StartupScriptComponent } from '@/app/modules/platform-tools/docker/startup-script/startup-script.component'
import { RestartLinuxComponent } from '@/app/modules/platform-tools/linux/restart-linux/restart-linux.component'
import { ShutdownLinuxComponent } from '@/app/modules/platform-tools/linux/shutdown-linux/shutdown-linux.component'
import { fakeApi, fakeWs, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The platform tools pages: restarting or shutting down the host, restarting the
 * Docker container, and editing the container's startup script.
 *
 * The two restart pages are the same shape as the Homebridge restart page and
 * carry the same hazard, spelled out in their own comments: the `status`
 * websocket namespace is shared and cached, and `io.end()` deliberately leaves
 * listeners attached. A page that does not detach its own handler keeps toasting
 * "restarted" and yanking the user back to the home page from wherever they have
 * since navigated to.
 *
 * Their timings differ because the things they are waiting for do: a container
 * comes back in seconds, a whole machine takes a minute or more.
 */
describe('the platform tools pages', () => {
  let api: FakeApi
  let settings: FakeSettings
  let toastr: ReturnType<typeof toastrStub>
  let ws: FakeWs
  let io: FakeIoNamespace
  let navigate: ReturnType<typeof vi.fn>
  let isMobile: boolean
  // Rebuilt by each `open()` so a case can assert on the touch-lock calls without
  // the previous case's counts carrying over
  let md: {
    detect: { mobile: () => boolean }
    disableTouchMove: ReturnType<typeof vi.fn>
    enableTouchMove: ReturnType<typeof vi.fn>
  }

  /**
   * Build one of the pages.
   * @param type - the page component
   * @param options - how to set it up
   * @param options.script - the startup script the route resolver supplies
   * @param options.arrange - registers responses on the freshly built fakes
   */
  async function open<T>(type: new (...args: any[]) => T, options: {
    script?: string
    arrange?: () => void
  } = {}) {
    TestBed.resetTestingModule()
    api = fakeApi()
    md = {
      detect: { mobile: () => isMobile },
      disableTouchMove: vi.fn(),
      enableTouchMove: vi.fn(),
    }
    settings = makeSettings()
    toastr = toastrStub()
    ws = fakeWs()
    io = ws.namespace('status')

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ api, settings, toastr, ws }),
        { provide: MobileDetectService, useValue: md },
        {
          provide: ActivatedRoute,
          useValue: { data: of({ startupScript: { script: options.script ?? '#!/bin/sh\n\necho hello' } }) },
        },
      ],
    })

    // The startup script page renders a Monaco editor; the rest are static
    TestBed.overrideComponent(type as any, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    navigate = vi.fn(async () => true)
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate as any)

    options.arrange?.()

    const fixture = TestBed.createComponent(type as any)
    fixture.detectChanges()
    await fixture.whenStable()

    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }

    return fixture.componentInstance as T
  }

  beforeEach(() => {
    isMobile = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('restarting the host machine', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('asks the server to restart the host', async () => {
      const page = await open(RestartLinuxComponent)

      expect(api.lastCall('put', '/platform-tools/linux/restart-host')?.body).toEqual({})
      expect(page.error()).toBe(false)
    })

    it('shows an error when the restart cannot be started', async () => {
      const page = await open(RestartLinuxComponent, {
        arrange: () => api.fail('put', '/platform-tools/linux/restart-host', new Error('not permitted')),
      })

      expect(page.error()).toBe('platform.linux.server_restart_error')
      expect(toastr.at('error')).toHaveLength(1)
    })

    it('ignores a status event from the machine that is still going down', async () => {
      await open(RestartLinuxComponent)

      // Most of the way through the settling period, so shortening the wait does
      // not still look like a pass
      await vi.advanceTimersByTimeAsync(29000)
      io.socket.fire('homebridge-status', { status: 'ok' })

      // A whole machine takes tens of seconds to even begin rebooting
      expect(navigate).not.toHaveBeenCalled()
    })

    it('believes a status event after thirty seconds', async () => {
      await open(RestartLinuxComponent)

      await vi.advanceTimersByTimeAsync(30000)
      io.socket.fire('homebridge-status', { status: 'ok' })

      expect(toastr.at('success')[0].message).toBe('platform.linux.server_restarted')
      expect(navigate).toHaveBeenCalledWith(['/'])
    })

    it('announces the restart only once', async () => {
      await open(RestartLinuxComponent)
      await vi.advanceTimersByTimeAsync(30000)

      io.socket.fire('homebridge-status', { status: 'ok' })
      io.socket.fire('homebridge-status', { status: 'pending' })

      expect(toastr.at('success')).toHaveLength(1)
      expect(navigate).toHaveBeenCalledTimes(1)
    })

    it('warns after two minutes', async () => {
      const page = await open(RestartLinuxComponent)

      await vi.advanceTimersByTimeAsync(120000)

      expect(page.timeout()).toBe(true)
      expect(toastr.at('warning')[0].message).toBe('platform.linux.server_taking_long_time')
    })

    it('does not warn before then', async () => {
      const page = await open(RestartLinuxComponent)

      await vi.advanceTimersByTimeAsync(119000)

      expect(page.timeout()).toBe(false)
    })

    it('detaches its status listener when the user navigates away', async () => {
      await open(RestartLinuxComponent)
      expect(io.socket.handlers('homebridge-status')).toHaveLength(1)

      TestBed.resetTestingModule()

      // `io.end()` leaves listeners in place on purpose, because the namespace is
      // shared, so this page has to remove its own
      expect(io.socket.handlers('homebridge-status')).toHaveLength(0)
    })

    it('does not navigate from an unrelated page after teardown', async () => {
      await open(RestartLinuxComponent)
      await vi.advanceTimersByTimeAsync(30000)

      TestBed.resetTestingModule()
      io.socket.fire('homebridge-status', { status: 'ok' })

      expect(navigate).not.toHaveBeenCalled()
    })

    it('re-subscribes and reloads its settings when the socket returns', async () => {
      await open(RestartLinuxComponent)

      io.markConnected()

      expect(io.socket.payloadsFor('monitor-server-status').length).toBeGreaterThan(1)
      expect(settings.getAppSettings).toHaveBeenCalled()
    })
  })

  describe('restarting the docker container', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('asks the server to restart the container', async () => {
      const page = await open(ContainerRestartComponent)

      expect(api.lastCall('put', '/platform-tools/docker/restart-container')?.body).toEqual({})
      expect(page.error()).toBe(false)
    })

    it('waits a shorter time than a whole machine reboot', async () => {
      await open(ContainerRestartComponent)

      await vi.advanceTimersByTimeAsync(9000)
      io.socket.fire('homebridge-status', { status: 'ok' })
      expect(navigate).not.toHaveBeenCalled()

      // A container is back in seconds, so waiting thirty would leave the user
      // staring at a spinner long after it was ready
      await vi.advanceTimersByTimeAsync(1000)
      io.socket.fire('homebridge-status', { status: 'ok' })
      expect(navigate).toHaveBeenCalledWith(['/'])
    })

    it('says the container restarted, not the server', async () => {
      await open(ContainerRestartComponent)
      await vi.advanceTimersByTimeAsync(10000)

      io.socket.fire('homebridge-status', { status: 'ok' })

      expect(toastr.at('success')[0].message).toBe('platform.docker.container_restarted')
    })

    it('warns after a minute', async () => {
      const page = await open(ContainerRestartComponent)

      await vi.advanceTimersByTimeAsync(60000)

      expect(page.timeout()).toBe(true)
      expect(toastr.at('warning')[0].config).toEqual({ timeOut: 10000 })
    })

    it('shows an error when the restart cannot be started', async () => {
      const page = await open(ContainerRestartComponent, {
        arrange: () => api.fail('put', '/platform-tools/docker/restart-container', new Error('no docker socket')),
      })

      expect(page.error()).toBe('restart.toast_server_restart_error')
    })

    it('detaches its status listener too', async () => {
      await open(ContainerRestartComponent)

      TestBed.resetTestingModule()

      expect(io.socket.handlers('homebridge-status')).toHaveLength(0)
    })
  })

  describe('shutting down the host machine', () => {
    it('asks the server to shut the host down', async () => {
      const page = await open(ShutdownLinuxComponent)

      expect(api.lastCall('put', '/platform-tools/linux/shutdown-host')?.body).toEqual({})
      expect(page.error()).toBe(false)
    })

    it('waits for nothing, because nothing is coming back', async () => {
      await open(ShutdownLinuxComponent)

      // Unlike its restart sibling there is no socket, no timer and no
      // navigation: the machine is going away
      expect(ws.connectToNamespace).not.toHaveBeenCalled()
    })

    it('uses its own message rather than the restart one', async () => {
      const page = await open(ShutdownLinuxComponent, {
        arrange: () => api.fail('put', '/platform-tools/linux/shutdown-host', new Error('not permitted')),
      })

      // Telling a user their shutdown failed to restart would be confusing; this
      // page has its own translated key
      expect(page.error()).toBe('platform.linux.server_shutdown_error')
      expect(toastr.at('error')[0].message).toBe('platform.linux.server_shutdown_error')
    })
  })

  describe('editing the container startup script', () => {
    let editorValue: string

    /**
     * A stand-in for the Monaco editor.
     */
    function fakeEditor() {
      return {
        getModel: () => ({
          getValue: () => editorValue,
          setValue: (value: string) => {
            editorValue = value
          },
        }),
        getAction: () => ({ run: vi.fn() }),
        // Called on teardown, so without it every following test in this block
        // fails during cleanup rather than on its own assertion
        dispose: vi.fn(),
      }
    }

    /**
     * Build the page with a fake editor already attached.
     * @param script - the script the route resolver supplies
     */
    async function openScript(script: string) {
      const page = await open(StartupScriptComponent, { script })
      editorValue = ''
      page.onEditorInit(fakeEditor())
      return page
    }

    beforeEach(() => {
      editorValue = ''
    })

    it('loads the script the resolver fetched', async () => {
      const page = await openScript('#!/bin/sh\n\necho hello')

      // Resolved by the route rather than fetched here, so the editor never
      // shows an empty box first
      expect(page.startupScript()).toBe('#!/bin/sh\n\necho hello')
      expect(editorValue).toBe('#!/bin/sh\n\necho hello')
    })

    it('saves what the editor holds', async () => {
      const page = await openScript('#!/bin/sh\n\necho hello')
      editorValue = '#!/bin/bash\n\necho goodbye'

      await page.onSave()

      expect(api.lastCall('put', '/platform-tools/docker/startup-script')?.body)
        .toEqual({ script: '#!/bin/bash\n\necho goodbye' })
      expect(toastr.at('success')).toHaveLength(1)
    })

    it('accepts either of the two shells', async () => {
      for (const hashbang of ['#!/bin/sh', '#!/bin/bash']) {
        const page = await openScript(`${hashbang}\necho hi`)
        editorValue = `${hashbang}\necho hi`

        await page.onSave()

        expect(api.callsTo('put', '/platform-tools/docker/startup-script')).toHaveLength(1)
      }
    })

    it('refuses a script with no hashbang and adds one', async () => {
      const page = await openScript('echo hello')
      editorValue = 'echo hello'

      await page.onSave()

      // The container runs this directly, so without a hashbang it does not
      // execute at all - the script is repaired rather than just rejected
      expect(api.callsTo('put', '/platform-tools/docker/startup-script')).toHaveLength(0)
      expect(toastr.at('error')[0].message).toBe('platform.docker.must_use_hashbang')
      expect(page.startupScript()).toBe('#!/bin/sh\n\necho hello')
      expect(editorValue).toBe('#!/bin/sh\n\necho hello')
    })

    it('refuses a hashbang that is not on the first line', async () => {
      const page = await openScript('# a comment\n#!/bin/sh')
      editorValue = '# a comment\n#!/bin/sh'

      await page.onSave()

      expect(api.callsTo('put')).toHaveLength(0)
    })

    it('tolerates whitespace around the hashbang', async () => {
      const page = await openScript('  #!/bin/sh  \necho hi')
      editorValue = '  #!/bin/sh  \necho hi'

      await page.onSave()

      expect(api.callsTo('put', '/platform-tools/docker/startup-script')).toHaveLength(1)
    })

    it('re-enables the button when the save fails', async () => {
      const page = await openScript('#!/bin/sh\necho hi')
      editorValue = '#!/bin/sh\necho hi'
      api.fail('put', '/platform-tools/docker/startup-script', new Error('read only'))

      await page.onSave()

      expect(page.saveInProgress()).toBe(false)
      expect(toastr.at('error')).toHaveLength(1)
    })

    it('ignores a second press while the first is in flight', async () => {
      const page = await openScript('#!/bin/sh\necho hi')
      editorValue = '#!/bin/sh\necho hi'

      const first = page.onSave()
      await page.onSave()
      await first

      // Two overlapping writes to the same file is how it ends up half written
      expect(api.callsTo('put', '/platform-tools/docker/startup-script')).toHaveLength(1)
    })

    /**
     * Making room for the on-screen keyboard.
     *
     * ⚠️ **The editor is full height, so an open keyboard would cover the line the
     * user is typing on.** The page listens to the visual viewport - the part of
     * the window not hidden by the keyboard - and lets the page scroll while it is
     * open, then locks scrolling again when it closes.
     */
    describe('the on-screen keyboard', () => {
      /**
       * Pretend the visible part of the window is a given height.
       * @param height - the visual viewport height
       */
      function viewportHeight(height: number) {
        Object.defineProperty(window, 'visualViewport', {
          value: { height, addEventListener: vi.fn(), removeEventListener: vi.fn() },
          configurable: true,
        })
        Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true, writable: true })
      }

      afterEach(() => {
        delete (window as any).visualViewport
      })

      it('lets the page scroll while the keyboard is up', async () => {
        // ⚠️ Locked, the user cannot scroll the line they are typing into view
        viewportHeight(800)
        const page = await open(StartupScriptComponent) as any
        viewportHeight(400)

        page.visualViewPortChanged()

        expect(md.enableTouchMove).toHaveBeenCalled()
      })

      it('locks it again once the keyboard closes', async () => {
        viewportHeight(400)
        const page = await open(StartupScriptComponent) as any
        viewportHeight(800)

        page.visualViewPortChanged()

        expect(md.disableTouchMove).toHaveBeenCalled()
      })

      it('takes focus off the field when the keyboard closes', async () => {
        // ⚠️ Otherwise the keyboard reopens the moment the page is touched again,
        // because the field never lost focus.
        //
        // ⚠️ The whole open-then-close has to be driven: the blur fires on the
        // viewport growing back, which is only bigger than what the page last
        // recorded if the keyboard opened first
        viewportHeight(800)
        const page = await open(StartupScriptComponent) as any
        const field = document.createElement('input')
        document.body.append(field)
        field.focus()

        viewportHeight(400)
        page.visualViewPortChanged()
        viewportHeight(800)
        page.visualViewPortChanged()

        expect(document.activeElement).not.toBe(field)
        field.remove()
      })

      it('leaves focus alone while the keyboard is opening', async () => {
        viewportHeight(800)
        const page = await open(StartupScriptComponent) as any
        const field = document.createElement('input')
        document.body.append(field)
        field.focus()
        viewportHeight(400)

        page.visualViewPortChanged()

        expect(document.activeElement).toBe(field)
        field.remove()
      })
    })

    it('reads the script from the signal on a phone', async () => {
      isMobile = true
      const page = await open(StartupScriptComponent, { script: '#!/bin/sh\necho hi' })

      await page.onSave()

      // There is no Monaco editor on mobile, so reaching for one would throw
      expect(page.isMobile()).toBe(true)
      expect(api.lastCall('put', '/platform-tools/docker/startup-script')?.body)
        .toEqual({ script: '#!/bin/sh\necho hi' })
    })

    it('repairs a mobile script without touching an editor', async () => {
      isMobile = true
      const page = await open(StartupScriptComponent, { script: 'echo hi' })

      await page.onSave()

      expect(page.startupScript()).toBe('#!/bin/sh\n\necho hi')
      expect(api.callsTo('put')).toHaveLength(0)
    })
  })
})
