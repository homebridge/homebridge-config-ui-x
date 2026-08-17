import type { FakeSettings } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LogService } from '@/app/core/utilities/log.service'
import { TerminalNavigationGuardService } from '@/app/core/utilities/terminal-navigation-guard.service'
import { TerminalService } from '@/app/core/utilities/terminal.service'
import { LogsComponent } from '@/app/modules/logs/logs.component'
import { TerminalComponent } from '@/app/modules/platform-tools/terminal/terminal.component'
import { makeAuth, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The two full-screen terminal pages: the Homebridge log, and the shell.
 *
 * Neither draws anything itself - both hand a target element to a service that
 * owns the xterm instance - so what is actually under test is the surrounding
 * behaviour: which body classes are set so the page is not briefly white on a
 * black terminal, the fade timings that `canDeactivate` waits for, and (on the
 * log page) the three-character minimum on the search box.
 *
 * The services are faked rather than mocked at the xterm level: everything these
 * pages do goes through a handful of their methods.
 */
describe('the terminal pages', () => {
  let settings: FakeSettings
  let log: Record<string, ReturnType<typeof vi.fn>>
  let terminal: Record<string, ReturnType<typeof vi.fn>>
  let navigationGuard: { canDeactivate: ReturnType<typeof vi.fn>, handleBeforeUnload: ReturnType<typeof vi.fn> }

  /**
   * Build one of the two pages.
   * @param type - the page component
   * @param options - how to set the page up
   * @param options.settings - settings service overrides
   * @param options.arrange - runs on the freshly built fakes before creation
   */
  async function open<T>(type: new (...args: any[]) => T, options: {
    settings?: Parameters<typeof makeSettings>[0]
    arrange?: () => void
  } = {}) {
    TestBed.resetTestingModule()
    settings = makeSettings(options.settings)
    log = {
      startTerminal: vi.fn(),
      destroyTerminal: vi.fn(),
      setSearchFilter: vi.fn(),
      clearSearchFilter: vi.fn(),
      scrollToBottom: vi.fn(),
      downloadLogFile: vi.fn(async () => undefined),
      truncateLogFile: vi.fn(async () => undefined),
    }
    terminal = {
      startTerminal: vi.fn(),
      reconnectTerminal: vi.fn(),
      destroyTerminal: vi.fn(),
      detachTerminal: vi.fn(),
      destroyPersistentSession: vi.fn(async () => undefined),
      activateTerminal: vi.fn(),
      isTerminalReady: vi.fn(() => false),
      hasActiveSession: vi.fn(() => false),
      onTouchStart: vi.fn(),
      onTouchEnd: vi.fn(),
    }
    navigationGuard = {
      canDeactivate: vi.fn(async () => true),
      handleBeforeUnload: vi.fn(),
    }

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ settings, auth: makeAuth(), toastr: toastrStub() }),
        { provide: LogService, useValue: log },
        { provide: TerminalService, useValue: terminal },
        { provide: TerminalNavigationGuardService, useValue: navigationGuard },
      ],
    })

    options.arrange?.()

    const fixture = TestBed.createComponent(type as any)
    fixture.detectChanges()
    await fixture.whenStable()

    return { fixture, page: fixture.componentInstance as T }
  }

  /**
   * Let the pending animation-frame callbacks run.
   *
   * The browser stub drives `requestAnimationFrame` off the timer queue, so a
   * frame callback scheduled in `ngOnInit` has not fired by the time
   * `whenStable` returns.
   */
  function flushFrames(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  /** The classes currently on the body element. */
  function bodyClasses(): string[] {
    return [...document.body.classList]
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the log page', () => {
    it('names itself in the page title', async () => {
      await open(LogsComponent)

      expect(settings.setPageTitle).toHaveBeenCalledWith('menu.linux.label_logs')
    })

    it('hands the log service a target and read-only options', async () => {
      await open(LogsComponent)

      // Logs cannot be typed into, and an enabled stdin would make the hidden
      // xterm textarea a tab stop on a page with nothing to type into
      expect(settings.getTerminalOptions).toHaveBeenCalledWith({ disableStdin: true })
      expect(log.startTerminal).toHaveBeenCalled()
    })

    it('paints the page black behind a dark terminal', async () => {
      await open(LogsComponent)

      // Without this the page flashes white around a black terminal while the
      // route loads
      expect(bodyClasses()).toContain('bg-black')
    })

    it('paints the page white behind a light terminal', async () => {
      await open(LogsComponent, {
        settings: { actualLightingMode: 'light', env: { terminal: { lightingMode: 'light' } } as any },
      })

      expect(bodyClasses()).toContain('bg-white')
      expect(bodyClasses()).not.toContain('bg-black')
    })

    it('eases the change only when a light theme meets a dark terminal', async () => {
      await open(LogsComponent, { settings: { actualLightingMode: 'light' } })

      // The jarring case: the rest of the app is light and this page is black
      expect(bodyClasses()).toContain('theme-transition')
    })

    it('does not ease the change when the app is already dark', async () => {
      await open(LogsComponent, { settings: { actualLightingMode: 'dark' } })

      expect(bodyClasses()).not.toContain('theme-transition')
    })

    it('tears the terminal down when the page closes', async () => {
      await open(LogsComponent)

      TestBed.resetTestingModule()

      // The terminal holds a socket to the server tailing a file
      expect(log.destroyTerminal).toHaveBeenCalled()
    })
  })

  describe('searching the log', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('treats one or two characters as not yet a search', async () => {
      const { page } = await open(LogsComponent)

      expect(page.searchInputInvalid).toBe(false)

      page.form.setValue({ query: 'ab' })
      // A one or two character filter would match nearly every line, and
      // filtering the whole buffer is not free
      expect(page.searchInputInvalid).toBe(true)

      page.form.setValue({ query: 'abc' })
      expect(page.searchInputInvalid).toBe(false)
    })

    it('searches by itself once there is enough to go on', async () => {
      const { page } = await open(LogsComponent)

      page.form.setValue({ query: 'homebridge' })
      await vi.advanceTimersByTimeAsync(500)

      expect(log.setSearchFilter).toHaveBeenCalledWith('homebridge')
      expect(page.showExitButton()).toBe(true)
    })

    it('waits for the user to stop typing', async () => {
      const { page } = await open(LogsComponent)

      page.form.setValue({ query: 'home' })
      page.form.setValue({ query: 'homebridge' })
      await vi.advanceTimersByTimeAsync(500)

      // Every keystroke would otherwise re-filter the entire scrollback
      expect(log.setSearchFilter).toHaveBeenCalledTimes(1)
      expect(log.setSearchFilter).toHaveBeenCalledWith('homebridge')
    })

    it('trims what the user typed, in the box as well as the filter', async () => {
      const { page } = await open(LogsComponent)

      page.form.setValue({ query: '  homebridge  ' })
      await vi.advanceTimersByTimeAsync(500)

      expect(log.setSearchFilter).toHaveBeenCalledWith('homebridge')
      // Written back without re-triggering the subscription, or this would loop
      expect(page.form.value.query).toBe('homebridge')
    })

    it('clears an active search when the query gets too short', async () => {
      const { page } = await open(LogsComponent)
      page.form.setValue({ query: 'homebridge' })
      await vi.advanceTimersByTimeAsync(500)

      page.form.setValue({ query: 'ho' })
      await vi.advanceTimersByTimeAsync(500)

      expect(log.clearSearchFilter).toHaveBeenCalled()
      expect(page.showExitButton()).toBe(false)
    })

    it('does not clear a search that was never running', async () => {
      const { page } = await open(LogsComponent)

      page.form.setValue({ query: 'ho' })
      await vi.advanceTimersByTimeAsync(500)

      // Nothing was filtered, so there is nothing to clear or scroll
      expect(log.clearSearchFilter).not.toHaveBeenCalled()
    })

    it('searches on enter when the query is long enough', async () => {
      const { page } = await open(LogsComponent)

      page.onSubmit({ query: '  homebridge ' })

      expect(log.setSearchFilter).toHaveBeenCalledWith('homebridge')
      expect(page.showExitButton()).toBe(true)
    })

    it('clears the box on enter when the query is too short', async () => {
      const { page } = await open(LogsComponent)

      page.onSubmit({ query: 'ho' })

      // Enter with an unusable query means show me everything, not nothing
      expect(page.form.value.query).toBe('')
      expect(log.clearSearchFilter).toHaveBeenCalled()
      expect(page.showExitButton()).toBe(false)
    })

    it('closes the search bar on enter with an empty box', async () => {
      const { page } = await open(LogsComponent)
      page.showSearch()

      page.onSubmit({ query: '' })

      expect(page.showSearchBar()).toBe(false)
    })

    it('opens the search bar and focuses it', async () => {
      const { fixture, page } = await open(LogsComponent)

      page.showSearch()
      fixture.detectChanges()
      await vi.advanceTimersByTimeAsync(10)

      expect(page.showSearchBar()).toBe(true)
      expect(log.scrollToBottom).toHaveBeenCalled()
    })

    it('clears the filter when the search bar is closed again', async () => {
      const { page } = await open(LogsComponent)
      page.showSearch()
      page.form.setValue({ query: 'homebridge' })
      await vi.advanceTimersByTimeAsync(500)

      page.showSearch()

      // Leaving the filter running with the box hidden would look like the log
      // had stopped receiving lines
      expect(page.showSearchBar()).toBe(false)
      expect(page.form.value.query).toBe('')
      expect(log.clearSearchFilter).toHaveBeenCalled()
    })

    it('clears the search from the exit button', async () => {
      const { page } = await open(LogsComponent)
      page.form.setValue({ query: 'homebridge' })
      await vi.advanceTimersByTimeAsync(500)

      page.onClearSearch()

      expect(page.form.value.query).toBe('')
      expect(page.showExitButton()).toBe(false)
      expect(log.clearSearchFilter).toHaveBeenCalled()
    })

    it('hands the download and truncate buttons to the service', async () => {
      const { page } = await open(LogsComponent)

      await page.downloadLogFile()
      await page.truncateLogFile()

      // Both need a confirmation the service owns, so the page must not
      // reimplement either
      expect(log.downloadLogFile).toHaveBeenCalled()
      expect(log.truncateLogFile).toHaveBeenCalled()
    })
  })

  describe('leaving a terminal page', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    /**
     * ⚠️ The log page and the shell page carry **their own copies** of this
     * transition logic, so the cases below run against both. A fix applied to one
     * and not the other is exactly the kind of drift this catches.
     */
    const PAGES: Array<[string, new (...args: any[]) => { canDeactivate: (nextUrl?: string) => Promise<boolean> | boolean }]> = [
      ['the log page', LogsComponent],
      ['the shell page', TerminalComponent],
    ]

    it.each(PAGES)('%s goes immediately when there is no theme change to ease', async (_name, type) => {
      const { page } = await open(type, { settings: { actualLightingMode: 'dark' } })

      await expect(page.canDeactivate()).resolves.toBe(true)

      // The background colours have to go, or the next page inherits them
      expect(bodyClasses()).not.toContain('bg-black')
      expect(bodyClasses()).not.toContain('bg-white')
    })

    it.each(PAGES)('%s waits for both animations before navigating away', async (_name, type) => {
      const { page } = await open(type, { settings: { actualLightingMode: 'light' } })
      let settled = false
      void Promise.resolve(page.canDeactivate('/plugins')).then(() => {
        settled = true
      })

      await vi.advanceTimersByTimeAsync(250)
      // The terminal has faded but the page is still black
      expect(settled).toBe(false)
      expect(bodyClasses()).not.toContain('bg-black')

      await vi.advanceTimersByTimeAsync(250)
      expect(settled).toBe(true)
    })

    it.each(PAGES)('%s leaves the background alone when the next page is also a terminal', async (_name, type) => {
      const { page } = await open(type, { settings: { actualLightingMode: 'light' } })

      const done = Promise.resolve(page.canDeactivate('/platform-tools/terminal'))
      await vi.advanceTimersByTimeAsync(250)
      await expect(done).resolves.toBe(true)

      // Fading the page back to white only to blacken it again would flash
      expect(bodyClasses()).toContain('bg-black')
    })

    it.each(PAGES)('%s keeps the background when going to the other terminal page', async (_name, type) => {
      const { page } = await open(type, { settings: { actualLightingMode: 'light' } })

      const done = Promise.resolve(page.canDeactivate('/logs'))
      await vi.advanceTimersByTimeAsync(250)
      await expect(done).resolves.toBe(true)

      expect(bodyClasses()).toContain('bg-black')
    })

    it('hides the search bar before fading, to avoid a mismatched strip', async () => {
      const { page } = await open(LogsComponent, { settings: { actualLightingMode: 'light' } })
      page.showSearch()

      const done = page.canDeactivate('/plugins')
      expect(page.showSearchBar()).toBe(false)

      await vi.advanceTimersByTimeAsync(500)
      await done
    })

    it('stays on the shell when the guard refuses', async () => {
      const { page } = await open(TerminalComponent, {
        arrange: () => {
          navigationGuard.canDeactivate = vi.fn(async () => false)
        },
      })

      await expect(page.canDeactivate('/plugins')).resolves.toBe(false)

      // A running command would be killed, so the guard's answer wins before any
      // of the theme handling runs
      expect(bodyClasses()).toContain('bg-black')
    })
  })

  describe('the shell page', () => {
    it('names itself in the page title', async () => {
      await open(TerminalComponent)

      expect(settings.setPageTitle).toHaveBeenCalledWith('menu.linux.label_terminal')
    })

    it('starts a fresh session by default', async () => {
      await open(TerminalComponent)

      expect(terminal.startTerminal).toHaveBeenCalled()
      expect(terminal.reconnectTerminal).not.toHaveBeenCalled()
    })

    it('asks for screen reader mode, unlike the log page', async () => {
      await open(TerminalComponent)

      // This terminal is typed into, so its hidden textarea is the input the
      // user is actually using
      expect(settings.getTerminalOptions).toHaveBeenCalledWith({ screenReaderMode: true })
    })

    it('reconnects to a session that is being kept alive', async () => {
      await open(TerminalComponent, {
        settings: { env: { terminal: { persistence: true } } as any },
        arrange: () => {
          terminal.hasActiveSession = vi.fn(() => true)
        },
      })

      // With persistence on, the command the user left running is still going
      expect(terminal.reconnectTerminal).toHaveBeenCalled()
      expect(terminal.startTerminal).not.toHaveBeenCalled()
    })

    it('throws away a leftover session when persistence is off', async () => {
      await open(TerminalComponent, {
        arrange: () => {
          terminal.hasActiveSession = vi.fn(() => true)
        },
      })

      // The setting may have been switched off while a session was open, and
      // leaving it running would hold a shell on the server forever
      expect(terminal.destroyPersistentSession).toHaveBeenCalled()
      expect(terminal.startTerminal).toHaveBeenCalled()
    })

    it('clears an existing terminal before starting another', async () => {
      await open(TerminalComponent, {
        arrange: () => {
          terminal.isTerminalReady = vi.fn(() => true)
        },
      })

      // Revisiting the page otherwise stacks a second set of event handlers on
      // the same element
      expect(terminal.destroyTerminal).toHaveBeenCalled()
    })

    it('keeps the session alive on the way out when persistence is on', async () => {
      await open(TerminalComponent, { settings: { env: { terminal: { persistence: true } } as any } })

      TestBed.resetTestingModule()

      expect(terminal.detachTerminal).toHaveBeenCalled()
      expect(terminal.destroyPersistentSession).not.toHaveBeenCalled()
    })

    it('ends the session on the way out when persistence is off', async () => {
      await open(TerminalComponent)

      TestBed.resetTestingModule()

      expect(terminal.destroyPersistentSession).toHaveBeenCalled()
      expect(terminal.detachTerminal).not.toHaveBeenCalled()
    })

    it('leaves no body classes behind', async () => {
      await open(TerminalComponent, { settings: { actualLightingMode: 'light' } })
      expect(bodyClasses()).toContain('bg-black')

      TestBed.resetTestingModule()

      // Navigating away from a crash or a hard route change skips canDeactivate,
      // so teardown has to clean up too
      expect(bodyClasses()).not.toContain('bg-black')
      expect(bodyClasses()).not.toContain('theme-transition')
    })

    it('wakes the terminal up when the user comes back to it', async () => {
      await open(TerminalComponent)
      // The page focuses the terminal once on init through a frame callback;
      // let that land before counting, or it is mistaken for the wake-up
      await flushFrames()
      terminal.isTerminalReady = vi.fn(() => true)
      terminal.activateTerminal.mockClear()

      document.dispatchEvent(new Event('visibilitychange'))
      await new Promise(resolve => setTimeout(resolve, 0))

      // Switching browser tabs loses focus, and a terminal you have to click
      // before typing feels broken
      expect(terminal.activateTerminal).toHaveBeenCalled()
    })

    it('stops listening for tab changes once the page is gone', async () => {
      await open(TerminalComponent)
      await flushFrames()

      TestBed.resetTestingModule()
      terminal.activateTerminal.mockClear()
      document.dispatchEvent(new Event('visibilitychange'))
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(terminal.activateTerminal).not.toHaveBeenCalled()
    })

    it('lets the guard decide about closing the browser tab', async () => {
      const { page } = await open(TerminalComponent)
      const event = new Event('beforeunload') as BeforeUnloadEvent

      page.onBeforeUnload(event)

      expect(navigationGuard.handleBeforeUnload).toHaveBeenCalledWith(event)
    })

    it.each([
      ['onTouchStart', 'onTouchStart'],
      ['onTouchEnd', 'onTouchEnd'],
    ])('hands %s to the terminal, which decides scroll from select', async (method, delegate) => {
      // ⚠️ Without these the terminal cannot be scrolled on a phone at all: the
      // service is what tells a drag-to-scroll apart from a drag-to-select
      const { page } = await open(TerminalComponent)
      const event = { touches: [] } as unknown as TouchEvent

      ;(page as any)[method](event)

      expect(terminal[delegate]).toHaveBeenCalledWith(event)
    })

    it('redraws the terminal when the window is resized', async () => {
      // xterm sizes itself in character cells, so it has to be told to re-measure
      // or the output keeps wrapping to the old width
      const { page } = await open(TerminalComponent)
      const resized = vi.fn()
      ;(page as any).resizeEvent.subscribe(resized)

      page.onWindowResize()

      expect(resized).toHaveBeenCalled()
    })

    /**
     * The full-page terminal's own copy of the live-region patch.
     *
     * ⚠️ **This is the third copy of these rules** — the shell widget and the
     * plugin install log each have their own. xterm asks for `assertive`, which
     * interrupts a screen reader for every line of output, so all three quieten it
     * and any one of them can be fixed without the others.
     */
    describe('what a screen reader hears', () => {
      it('quietens the live region xterm sets up', async () => {
        vi.useFakeTimers()
        const { page } = await open(TerminalComponent)
        const host = (page as any).termTarget()?.nativeElement as HTMLElement
        const live = document.createElement('div')
        live.setAttribute('aria-live', 'assertive')
        host.append(live)

        await vi.advanceTimersByTimeAsync(0)

        expect(live.getAttribute('aria-live')).toBe('polite')
        expect(live.getAttribute('role')).toBe('status')
        expect(live.getAttribute('aria-atomic')).toBe('true')
        vi.useRealTimers()
      })

      it('copes with xterm not having built one yet', async () => {
        // The patch runs on a timer that can beat the terminal into existence
        vi.useFakeTimers()
        await open(TerminalComponent)

        await expect(vi.advanceTimersByTimeAsync(0)).resolves.not.toThrow()
        vi.useRealTimers()
      })
    })

    it('activates the terminal when clicked', async () => {
      const { page } = await open(TerminalComponent)
      terminal.activateTerminal.mockClear()

      page.onClick()
      page.onWindowFocus()

      expect(terminal.activateTerminal).toHaveBeenCalledTimes(2)
    })
  })
})
