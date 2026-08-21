import type { LogService } from '@/app/core/utilities/log.service'
import type { TerminalService } from '@/app/core/utilities/terminal.service'
import type { FakeApi, FakeIoNamespace, FakeModalService, FakeToastr, FakeWs } from '@/testing'
import type { ElementRef } from '@angular/core'

import { TestBed } from '@angular/core/testing'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { CONFIRM_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SAVE_AS } from '@/app/core/utilities/file-saver.factory'
import { TERMINAL_FACTORY } from '@/app/core/utilities/terminal.factory'
import { fakeApi, fakeSaveAs, fakeTerminals, fakeWs, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * ⚠️ The terminal is substituted through `TERMINAL_FACTORY`, not by mocking
 * `@xterm/xterm`. A module mock cannot reach these services: the unit-test
 * builder compiles the app through its build target, so xterm is bundled into
 * the service and the mock never applies - the service quietly builds a real
 * terminal and every `written`/`focus` assertion reads `undefined`.
 */

/**
 * A stand-in for xterm's Terminal, recording everything written and handing
 * back the two disposables the services hold onto.
 *
 * ⚠️ Every method the services call has to exist here. A missing `dispose`
 * shows up as a failure in *cleanup* of the following tests rather than on its
 * own assertion, which reads as a dozen broken tests instead of one gap.
 */

/**
 * The two services that own an xterm instance: LogService (read-only, and the
 * only place log filtering and downloading lives) and TerminalService (the
 * interactive shell).
 *
 * They look similar but differ in the ways that have actually caused bugs:
 * LogService must emit `tail-log` exactly once per connection or every line
 * arrives twice, and TerminalService must strip its old socket listeners before
 * re-registering or output doubles on every remount.
 */
describe('the terminal-owning services', () => {
  let ws: FakeWs
  let io: FakeIoNamespace
  let api: FakeApi
  let toastr: FakeToastr
  let modal: FakeModalService
  let host: HTMLElement
  let target: ElementRef
  let xterm: ReturnType<typeof fakeTerminals>
  let saveAs: ReturnType<typeof fakeSaveAs>

  /** The most recently constructed fake terminal. */
  function term() {
    return xterm.term()
  }

  /** The most recently constructed fake fit addon. */
  function fit() {
    return xterm.fit()
  }

  async function configure(namespace: string) {
    TestBed.resetTestingModule()
    xterm = fakeTerminals()
    saveAs = fakeSaveAs()

    ws = fakeWs()
    io = ws.namespace(namespace, { connected: false })
    api = fakeApi()
    toastr = toastrStub()
    modal = modalServiceSpy()

    host = document.createElement('div')
    document.body.appendChild(host)
    target = { nativeElement: host } as ElementRef

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ api, ws, toastr, modal }),
        { provide: TERMINAL_FACTORY, useValue: xterm.factory },
        { provide: SAVE_AS, useValue: saveAs },
      ],
    })
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    host?.remove()
  })

  describe('logService', () => {
    let service: LogService

    async function start(options: { pluginName?: string, elementResize?: Subject<void> } = {}) {
      await configure('log')
      const { LogService } = await import('@/app/core/utilities/log.service')
      service = TestBed.inject(LogService)
      service.startTerminal(target, { fontSize: 15 }, options.elementResize, options.pluginName)
      return service
    }

    /** Bring the socket up, which is what makes the service ask for the log. */
    function connect() {
      io.markConnected()
    }

    function stdout(data: string) {
      io.socket.fire('stdout', data)
    }

    it('connects to the log namespace and opens a read-only terminal', async () => {
      await start()

      expect(ws.connectToNamespace).toHaveBeenCalledWith('log')
      // Read-only wins over anything the caller passed
      expect(term().options).toEqual({ fontSize: 15, disableStdin: true })
      expect(term().open).toHaveBeenCalledWith(host)
    })

    it('loads the addons before opening, so the first fit has something to measure', async () => {
      await start()

      expect(term().loadAddon).toHaveBeenCalledTimes(2)
      expect(vi.mocked(term().loadAddon).mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(term().open).mock.invocationCallOrder[0])
    })

    it('fits the terminal to its element once the current task finishes', async () => {
      vi.useFakeTimers()
      await start()
      expect(fit().fit).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(0)

      expect(fit().fit).toHaveBeenCalled()
    })

    it('asks for the log exactly once per connection', async () => {
      // Emitting `tail-log` synchronously as well as on `connected` attaches
      // two log streams to the socket, and every line arrives twice (#2806)
      await start()
      connect()

      expect(io.socket.payloadsFor('tail-log')).toEqual([{ cols: 80, rows: 24 }])
    })

    it('starts from a clean terminal on every reconnection', async () => {
      await start()
      connect()
      stdout('first run\n\r')

      io.connected.next()

      expect(term().reset).toHaveBeenCalledTimes(2)
      expect(io.socket.payloadsFor('tail-log')).toHaveLength(2)
    })

    it('says so in the terminal when the socket drops', async () => {
      await start()
      connect()

      io.socket.fire('disconnect')

      expect(term().written.join('')).toContain('Websocket failed to connect')
    })

    it('tells the server about a resize, but only after half a second', async () => {
      vi.useFakeTimers()
      await start()
      connect()

      term().resizeHandlers[0]({ cols: 100, rows: 40 })
      await vi.advanceTimersByTimeAsync(499)
      expect(io.socket.payloadsFor('resize')).toEqual([])

      await vi.advanceTimersByTimeAsync(1)
      expect(io.socket.payloadsFor('resize')).toEqual([{ cols: 100, rows: 40 }])
    })

    it('refits when the widget it sits in is resized', async () => {
      vi.useFakeTimers()
      const elementResize = new Subject<void>()
      await start({ elementResize })
      await vi.advanceTimersByTimeAsync(0)
      vi.mocked(fit().fit).mockClear()

      elementResize.next()
      await vi.advanceTimersByTimeAsync(100)

      expect(fit().fit).toHaveBeenCalled()
    })

    describe('what reaches the terminal', () => {
      it('writes the whole stream when nothing is filtered', async () => {
        await start()
        connect()

        stdout('a line\n\ranother line\n\r')

        expect(term().written).toEqual(['a line\n\ranother line\n\r'])
      })

      it('writes only the matching lines while a filter is set', async () => {
        await start()
        connect()
        service.setSearchFilter('homekit')

        stdout('setting up homekit\n\rsomething else\n\rhomekit ready\n\r')

        expect(term().written).toEqual(['setting up homekit\n\r', 'homekit ready\n\r'])
      })

      it('matches regardless of case', async () => {
        await start()
        connect()
        service.setSearchFilter('HomeKit')

        stdout('setting up homekit\n\r')

        expect(term().written).toEqual(['setting up homekit\n\r'])
      })

      it('looks past the colour codes when matching', async () => {
        // A colour reset landing inside the phrase would otherwise stop the
        // filter matching it.
        // ⚠️ Real ESC bytes, written as \u001B: a bare '[0m' is ordinary
        // text, and a test using that passes whether or not the code strips
        // anything.
        await start()
        connect()
        service.setSearchFilter('homekit ready')

        stdout('homekit\u001B[0m ready\n\rsomething else\n\r')

        expect(term().written).toEqual(['homekit\u001B[0m ready\n\r'])
      })

      it('keeps only one plugin when scoped to it', async () => {
        await start({ pluginName: 'homebridge-hue' })
        connect()

        stdout('36m[homebridge-hue] mine\n\r36m[homebridge-nest] theirs\n\r')

        expect(term().written).toEqual(['36m[homebridge-hue] mine\n\r'])
      })

      it('keeps the untagged continuation lines of a scoped plugin', async () => {
        // A stack trace has the plugin tag only on its first line
        await start({ pluginName: 'homebridge-hue' })
        connect()

        stdout('36m[homebridge-hue] Error\n\r    at doThing()\n\r    at doOther()\n\r')

        expect(term().written).toEqual([
          '36m[homebridge-hue] Error\n\r',
          '    at doThing()\n\r',
          '    at doOther()\n\r',
        ])
      })

      it('stops following the continuation at the next tagged line', async () => {
        await start({ pluginName: 'homebridge-hue' })
        connect()

        stdout('36m[homebridge-hue] Error\n\r    at doThing()\n\r36m[homebridge-nest] theirs\n\r    at theirThing()\n\r')

        expect(term().written).toEqual([
          '36m[homebridge-hue] Error\n\r',
          '    at doThing()\n\r',
        ])
      })
    })

    describe('the search filter', () => {
      it('redraws the buffered log rather than waiting for new lines', async () => {
        await start()
        connect()
        stdout('setting up homekit\n\rsomething else\n\r')
        vi.mocked(term().clear).mockClear()

        service.setSearchFilter('homekit')

        expect(term().clear).toHaveBeenCalled()
        expect(term().written.at(-1)).toBe('setting up homekit\n\r')
      })

      it('puts everything back when cleared', async () => {
        await start()
        connect()
        stdout('setting up homekit\n\rsomething else\n\r')
        service.setSearchFilter('homekit')

        service.clearSearchFilter()

        expect(service.getSearchFilter()).toBeNull()
        expect(term().written.at(-1)).toBe('setting up homekit\n\rsomething else\n\r')
      })

      it('lowercases what it was given', async () => {
        await start()
        service.setSearchFilter('HomeKit')

        expect(service.getSearchFilter()).toBe('homekit')
      })

      it('does not keep an unbounded buffer', async () => {
        // 1000 chunks is the cap; the oldest is dropped
        await start()
        connect()
        for (let index = 0; index < 1100; index += 1) {
          stdout(`line ${index}\n\r`)
        }
        vi.mocked(term().clear).mockClear()
        const before = term().written.length

        service.setSearchFilter('line')

        const redrawn = term().written.length - before
        expect(redrawn).toBe(1000)
        expect(term().written.at(-1)).toBe('line 1099\n\r')
      })
    })

    it('scrolls to the end of the buffer, not to a fixed row', async () => {
      vi.useFakeTimers()
      await start()

      service.scrollToBottom()
      await vi.advanceTimersByTimeAsync(10)

      expect(term().scrollToLine).toHaveBeenCalledWith(42)
    })

    describe('downloading the log', () => {
      async function settle() {
        for (let tick = 0; tick < 10; tick += 1) {
          await Promise.resolve()
        }
      }

      function blobResponse(text: string) {
        return { body: new Blob([text], { type: 'text/plain' }) }
      }

      it('warns that the log may contain sensitive information first', async () => {
        await start()
        api.respond('get', '/platform-tools/hb-service/log/download', blobResponse('hello'))

        void service.downloadLogFile()
        await settle()

        expect(modal.lastOpened()!.content).toBe(ConfirmComponent)
        expect(modal.dataFor(CONFIRM_MODAL_DATA)).toMatchObject({
          title: 'logs.title_download_log_file',
          message: 'logs.download_warning',
        })
      })

      it('downloads nothing when the warning is dismissed', async () => {
        await start()

        void service.downloadLogFile()
        await settle()
        modal.lastOpened()!.ref.dismiss()
        await settle()

        expect(api.callsTo('get', '/platform-tools/hb-service/log/download')).toEqual([])
      })

      it('asks for the whole file as a blob', async () => {
        await start()
        api.respond('get', '/platform-tools/hb-service/log/download', blobResponse('hello'))

        void service.downloadLogFile()
        await settle()
        modal.lastOpened()!.ref.close()
        await settle()

        expect(api.lastCall('get', '/platform-tools/hb-service/log/download')?.options)
          .toEqual({ observe: 'response', responseType: 'blob' })
        expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'homebridge.log.txt')
      })

      it('saves only the matching lines while a filter is set', async () => {
        await start()
        api.respond('get', '/platform-tools/hb-service/log/download', blobResponse('setting up homekit\nsomething else\nhomekit ready\n'))
        service.setSearchFilter('homekit')

        void service.downloadLogFile()
        await settle()
        modal.lastOpened()!.ref.close()
        await settle()

        const saved = saveAs.mock.calls.at(-1)![0] as Blob
        expect(await saved.text()).toBe('setting up homekit\nhomekit ready')
      })

      it('surfaces the message the server put in the error blob', async () => {
        await start()
        api.fail('get', '/platform-tools/hb-service/log/download', {
          error: new Blob([JSON.stringify({ message: 'Log file not found' })]),
        })

        void service.downloadLogFile()
        await settle()
        modal.lastOpened()!.ref.close()
        await settle()

        expect(toastr.error).toHaveBeenCalledWith('Log file not found', 'toast.title_error')
      })

      it('falls back to its own message when the error carries none', async () => {
        await start()
        api.fail('get', '/platform-tools/hb-service/log/download', new Error('network down'))

        void service.downloadLogFile()
        await settle()
        modal.lastOpened()!.ref.close()
        await settle()

        expect(toastr.error).toHaveBeenCalledWith('logs.download.error', 'toast.title_error')
      })
    })

    describe('truncating the log', () => {
      async function settle() {
        for (let tick = 0; tick < 10; tick += 1) {
          await Promise.resolve()
        }
      }

      it('asks for confirmation with a destructive button', async () => {
        await start()

        void service.truncateLogFile()
        await settle()

        expect(modal.dataFor(CONFIRM_MODAL_DATA)).toMatchObject({
          title: 'logs.title_truncate_log_file',
          confirmButtonClass: 'btn-danger',
        })
      })

      it('truncates nothing when dismissed', async () => {
        await start()

        void service.truncateLogFile()
        await settle()
        modal.lastOpened()!.ref.dismiss()
        await settle()

        expect(api.callsTo('put')).toEqual([])
      })

      it('clears the terminal as well as the file', async () => {
        await start()
        api.respond('put', '/platform-tools/hb-service/log/truncate', {})

        void service.truncateLogFile()
        await settle()
        modal.lastOpened()!.ref.close()
        await settle()

        expect(api.lastCall('put')?.url).toBe('/platform-tools/hb-service/log/truncate')
        expect(toastr.success).toHaveBeenCalledWith('logs.log_file_truncated', 'toast.title_success')
        expect(term().clear).toHaveBeenCalled()
      })

      it('surfaces the server message on failure', async () => {
        await start()
        api.fail('put', '/platform-tools/hb-service/log/truncate', { error: { message: 'Permission denied' } })

        void service.truncateLogFile()
        await settle()
        modal.lastOpened()!.ref.close()
        await settle()

        expect(toastr.error).toHaveBeenCalledWith('Permission denied', 'toast.title_error')
      })
    })

    describe('tearing down', () => {
      it('detaches its listeners before ending the socket', async () => {
        // The socket is cached and outlives this terminal, so a listener left
        // behind fires against a disposed term
        await start()
        connect()

        service.destroyTerminal()

        expect(io.socket.handlers('stdout')).toEqual([])
        expect(io.socket.handlers('disconnect')).toEqual([])
        expect(io.end).toHaveBeenCalled()
        expect(term().dispose).toHaveBeenCalled()
      })

      it('forgets the buffer and the filter', async () => {
        await start()
        connect()
        stdout('a line\n\r')
        service.setSearchFilter('line')

        service.destroyTerminal()

        expect(service.getSearchFilter()).toBeNull()
      })

      it('can be started again afterwards', async () => {
        // `destroy$` has to be replaced rather than just completed
        await start()
        connect()
        service.destroyTerminal()

        service.startTerminal(target, {})

        // The replayed `connected` value reaches the new subscription, which it
        // could not if `destroy$` had merely been completed rather than replaced
        expect(io.socket.payloadsFor('tail-log')).toHaveLength(2)
      })
    })
  })

  describe('hiding the xterm input from screen readers', () => {
    let hideXtermInputFromScreenReader: typeof import('@/app/core/utilities/log.service').hideXtermInputFromScreenReader

    beforeEach(async () => {
      ({ hideXtermInputFromScreenReader } = await import('@/app/core/utilities/log.service'))
    })

    function withHelperTextarea() {
      const element = document.createElement('div')
      const textarea = document.createElement('textarea')
      textarea.className = 'xterm-helper-textarea'
      element.appendChild(textarea)
      document.body.appendChild(element)
      return { element, textarea }
    }

    it('takes the textarea out of the tab order and the accessibility tree', async () => {
      const { element, textarea } = withHelperTextarea()

      const dispose = hideXtermInputFromScreenReader(element)

      expect(textarea.getAttribute('aria-hidden')).toBe('true')
      expect(textarea.getAttribute('tabindex')).toBe('-1')
      expect(textarea.getAttribute('readonly')).toBe('true')
      dispose()
      element.remove()
    })

    it('leaves the textarea focusable, or copy stops working', async () => {
      // xterm copies a selection by focusing this textarea so the browser's
      // `copy` event reaches its handler - disabling or blurring it silently
      // breaks Ctrl+C on every read-only view
      const { element, textarea } = withHelperTextarea()

      const dispose = hideXtermInputFromScreenReader(element)

      expect(textarea.disabled).toBe(false)
      textarea.focus()
      expect(document.activeElement).toBe(textarea)
      dispose()
      element.remove()
    })

    it('re-applies the patch when xterm rebuilds its subtree', async () => {
      // xterm regenerates parts of its DOM as it renders, so a one-shot patch
      // after open() is not enough
      const element = document.createElement('div')
      document.body.appendChild(element)
      const dispose = hideXtermInputFromScreenReader(element)

      const textarea = document.createElement('textarea')
      textarea.className = 'xterm-helper-textarea'
      element.appendChild(textarea)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(textarea.getAttribute('aria-hidden')).toBe('true')
      dispose()
      element.remove()
    })

    it('stops watching once disposed', async () => {
      const element = document.createElement('div')
      document.body.appendChild(element)
      const dispose = hideXtermInputFromScreenReader(element)
      // Past the three catch-up timers it schedules, so only the observer is
      // left to prove anything
      await new Promise(resolve => setTimeout(resolve, 300))
      dispose()

      const textarea = document.createElement('textarea')
      textarea.className = 'xterm-helper-textarea'
      element.appendChild(textarea)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(textarea.getAttribute('aria-hidden')).toBeNull()
      element.remove()
    })
  })

  describe('terminalService', () => {
    let service: TerminalService

    async function start(options: { elementResize?: Subject<any>, autoFocus?: boolean } = {}) {
      await configure('platform-tools/terminal')
      const { TerminalService } = await import('@/app/core/utilities/terminal.service')
      service = TestBed.inject(TerminalService)
      service.startTerminal(target, { fontSize: 15 }, options.elementResize, options.autoFocus ?? true)
      return service
    }

    /** Bring the socket up and let the 200ms settle window pass. */
    async function connect() {
      io.markConnected()
      await vi.advanceTimersByTimeAsync(200)
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('connects to the terminal namespace and opens a writable terminal', async () => {
      await start()

      expect(ws.connectToNamespace).toHaveBeenCalledWith('platform-tools/terminal')
      // Unlike the log, nothing is forced - the shell needs stdin
      expect(term().options).toEqual({ fontSize: 15 })
      expect(term().open).toHaveBeenCalledWith(host)
    })

    it('waits out a settling window before starting the session', async () => {
      await start()
      io.markConnected()

      await vi.advanceTimersByTimeAsync(199)
      expect(io.socket.payloadsFor('start-session')).toEqual([])

      await vi.advanceTimersByTimeAsync(1)
      expect(io.socket.payloadsFor('start-session')).toEqual([{ cols: 80, rows: 24 }])
    })

    it('resets the terminal and takes focus when the session starts', async () => {
      await start()
      await connect()

      expect(term().reset).toHaveBeenCalled()
      expect(term().focus).toHaveBeenCalled()
    })

    it('leaves focus alone when the caller opted out', async () => {
      // The dashboard widget opts out so opening the page does not scroll down
      await start({ autoFocus: false })
      await connect()

      expect(term().reset).toHaveBeenCalled()
      expect(term().focus).not.toHaveBeenCalled()
    })

    it('strips the previous listeners so output is not doubled on a remount', async () => {
      // The namespace cache hands back the same socket, so without this each
      // attach stacked another stdout handler and every line appeared twice.
      //
      // ⚠️ Detach, not destroy: `destroyTerminal` removes the three listeners
      // itself, so a destroy/start cycle proves nothing about `startTerminal`.
      // `detachTerminal` deliberately leaves the socket and its listeners in
      // place, which is the case this cleanup exists for.
      await start()
      await connect()

      service.detachTerminal()
      service.startTerminal(target, {})
      await connect()

      expect(io.socket.handlers('stdout')).toHaveLength(1)
      expect(io.socket.handlers('process-exit')).toHaveLength(1)
      expect(io.socket.handlers('disconnect')).toHaveLength(1)
    })

    it('writes an incoming line once after a detach and re-attach', async () => {
      await start()
      await connect()
      service.detachTerminal()
      service.startTerminal(target, {})
      await connect()

      io.socket.fire('stdout', 'one line')

      expect((term().written as string[]).filter(entry => entry === 'one line')).toHaveLength(1)
    })

    it('writes what the server sends', async () => {
      await start()
      await connect()

      io.socket.fire('stdout', 'hello from the shell')

      expect(term().written).toContain('hello from the shell')
    })

    it('sends what the user types, and remembers that they typed', async () => {
      await start()
      await connect()

      term().dataHandlers[0]('ls\r')

      expect(io.socket.payloadsFor('stdin')).toEqual(['ls\r'])
      expect(service.hasUserTypedInSession()).toBe(true)
    })

    it('starts a fresh session when the shell process exits', async () => {
      await start()
      await connect()

      io.socket.fire('process-exit')

      expect(io.socket.payloadsFor('start-session')).toHaveLength(2)
      expect(service.hasUserTypedInSession()).toBe(false)
    })

    it('says so in the terminal when the socket drops', async () => {
      await start()
      await connect()

      io.socket.fire('disconnect')

      expect(term().written.join('')).toContain('Terminal disconnected')
    })

    it('survives a disconnect after the terminal has been detached', async () => {
      // detachTerminal keeps the socket alive on purpose, so the handler can
      // fire with `term` already disposed
      await start()
      await connect()
      service.detachTerminal()

      expect(() => io.socket.fire('disconnect')).not.toThrow()
    })

    it('tells the server about a resize, but only after half a second', async () => {
      await start()
      await connect()
      const emittedOnStart = io.socket.payloadsFor('resize').length

      term().resizeHandlers[0]({ cols: 120, rows: 50 })
      await vi.advanceTimersByTimeAsync(499)
      expect(io.socket.payloadsFor('resize')).toHaveLength(emittedOnStart)

      await vi.advanceTimersByTimeAsync(1)
      expect(io.socket.payloadsFor('resize').at(-1)).toEqual({ cols: 120, rows: 50 })
    })

    it('refuses a second start while the first is still coming up', async () => {
      // Two terminals on one element would both write to the same socket
      await start()

      expect(service.startTerminal(target, {})).toBe(false)
      expect(xterm.terminals).toHaveLength(1)
    })

    describe('reconnecting to a live session', () => {
      it('reuses the open socket instead of connecting again', async () => {
        await start()
        await connect()
        service.detachTerminal()

        expect(service.reconnectTerminal(target, {})).toBe(true)
        expect(ws.connectToNamespace).toHaveBeenCalledTimes(1)
        expect(io.socket.payloadsFor('start-session')).toHaveLength(2)
      })

      it('rejoins without wiping what is already on screen', async () => {
        // A reconnect is not a fresh session - resetting here would throw away
        // the scrollback the user came back for
        await start()
        await connect()
        service.detachTerminal()
        service.reconnectTerminal(target, {})

        expect(term().reset).not.toHaveBeenCalled()
      })

      it('starts a fresh terminal when the socket has gone', async () => {
        // `reconnectTerminal` used to set its own in-progress flag and then hand
        // over to `startTerminal`, which refused because of that very flag - so
        // this returned false having done nothing, and the widget was left
        // showing a dead terminal until the page was reloaded
        await start()
        await connect()
        service.destroyTerminal()
        io.socket.connected = false

        expect(service.reconnectTerminal(target, {})).toBe(true)

        io.markConnected()
        await vi.advanceTimersByTimeAsync(200)
        expect(io.socket.payloadsFor('start-session')).toHaveLength(2)
      })

      it('refuses while another start is in flight', async () => {
        await start()

        expect(service.reconnectTerminal(target, {})).toBe(false)
      })

      it('writes incoming output into the new terminal', async () => {
        // ⚠️ The terminal object is replaced on reconnect, so the socket handlers
        // have to be re-pointed at it. Left on the old one, the session looks alive
        // and prints nothing
        await start()
        await connect()
        service.detachTerminal()
        service.reconnectTerminal(target, {})

        io.socket.fire('stdout', 'output after reconnecting')

        expect(term().written).toContain('output after reconnecting')
      })

      it('writes each chunk once, not once per reconnect', async () => {
        // The old listeners are removed first; without that, coming back to the
        // dashboard twice prints everything twice
        await start()
        await connect()
        service.detachTerminal()
        service.reconnectTerminal(target, {})
        service.detachTerminal()
        service.reconnectTerminal(target, {})

        io.socket.fire('stdout', 'once')

        expect(term().written.filter((chunk: string) => chunk === 'once')).toHaveLength(1)
      })

      it('sends one keystroke once after reconnecting', async () => {
        // The data listener from the previous terminal is disposed, or every key
        // reaches the shell twice
        await start()
        await connect()
        service.detachTerminal()
        service.reconnectTerminal(target, {})

        term().dataHandlers.at(-1)!('x')

        expect(io.socket.payloadsFor('stdin')).toEqual(['x'])
      })

      it('starts another session when the shell exits after a reconnect', async () => {
        await start()
        await connect()
        service.detachTerminal()
        service.reconnectTerminal(target, {})
        const before = io.socket.payloadsFor('start-session').length

        io.socket.fire('process-exit')

        expect(io.socket.payloadsFor('start-session')).toHaveLength(before + 1)
      })

      it('still forwards resizes after reconnecting', async () => {
        await start()
        await connect()
        service.detachTerminal()
        service.reconnectTerminal(target, {})
        io.socket.emitted.length = 0

        term().resizeHandlers.at(-1)!({ cols: 120, rows: 50 })
        await vi.advanceTimersByTimeAsync(500)

        expect(io.socket.payloadsFor('resize')).toEqual([{ cols: 120, rows: 50 }])
      })

      it('refits when the widget is resized after reconnecting', async () => {
        const elementResize = new Subject<void>()
        await start({ elementResize })
        await connect()
        service.detachTerminal()
        service.reconnectTerminal(target, {}, elementResize)
        vi.mocked(fit().fit).mockClear()

        elementResize.next()
        await vi.advanceTimersByTimeAsync(100)

        expect(fit().fit).toHaveBeenCalled()
      })
    })

    describe('detaching versus destroying', () => {
      it('keeps the socket open when detaching', async () => {
        await start()
        await connect()
        term().dataHandlers[0]('ls\r')

        service.detachTerminal()

        expect(io.end).not.toHaveBeenCalled()
        expect(term().dispose).toHaveBeenCalled()
        // Kept on purpose: the navigation guard asks about it before leaving
        expect(service.hasUserTypedInSession()).toBe(true)
      })

      it('ends the socket and forgets the typing when destroying', async () => {
        await start()
        await connect()
        term().dataHandlers[0]('ls\r')

        service.destroyTerminal()

        expect(io.end).toHaveBeenCalled()
        expect(service.hasUserTypedInSession()).toBe(false)
      })

      it('disposes the keyboard listener both ways', async () => {
        await start()
        await connect()

        service.detachTerminal()

        expect(term().dataDisposed).toBe(true)
      })

      it('tells the server to drop the persistent session as well', async () => {
        await start()
        await connect()
        api.respond('post', '/platform-tools/terminal/destroy-persistent-session', {})

        await service.destroyPersistentSession()

        expect(io.end).toHaveBeenCalled()
        expect(api.lastCall('post')?.url).toBe('/platform-tools/terminal/destroy-persistent-session')
      })

      it('does not throw when the server cannot drop the session', async () => {
        await start()
        await connect()
        api.fail('post', '/platform-tools/terminal/destroy-persistent-session', new Error('gone'))

        await expect(service.destroyPersistentSession()).resolves.toBeUndefined()
        expect(console.error).toHaveBeenCalled()
      })
    })

    describe('what the pages ask it', () => {
      it('reports an active session only while the socket is connected', async () => {
        await start()
        await connect()
        expect(service.hasActiveSession()).toBe(true)

        io.socket.connected = false
        expect(service.hasActiveSession()).toBe(false)
      })

      it('is not ready while still coming up', async () => {
        await start()

        expect(service.isTerminalReady()).toBe(false)
      })

      it('is ready once the session has started', async () => {
        await start()
        await connect()

        expect(service.isTerminalReady()).toBe(true)
      })

      it('focuses on request once ready', async () => {
        await start()
        await connect()
        vi.mocked(term().focus).mockClear()

        service.activateTerminal()

        expect(term().focus).toHaveBeenCalled()
      })

      it('does not focus before it is ready', async () => {
        await start()

        service.activateTerminal()

        expect(term().focus).not.toHaveBeenCalled()
      })
    })

    describe('touch handling', () => {
      function touch(y: number) {
        return { touches: [{ clientY: y }], changedTouches: [{ clientY: y }] } as unknown as TouchEvent
      }

      it('focuses on a tap', async () => {
        await start()
        await connect()
        vi.mocked(term().focus).mockClear()

        service.onTouchStart(touch(100))
        service.onTouchEnd(touch(104))

        expect(term().focus).toHaveBeenCalled()
      })

      it('does not focus when the finger was scrolling', async () => {
        // Otherwise scrolling the log pops the mobile keyboard open
        await start()
        await connect()
        vi.mocked(term().focus).mockClear()

        service.onTouchStart(touch(100))
        service.onTouchEnd(touch(160))

        expect(term().focus).not.toHaveBeenCalled()
      })

      it('ignores a touch end with no matching start', async () => {
        await start()
        await connect()
        vi.mocked(term().focus).mockClear()

        service.onTouchEnd(touch(100))

        expect(term().focus).not.toHaveBeenCalled()
      })
    })
  })
})
