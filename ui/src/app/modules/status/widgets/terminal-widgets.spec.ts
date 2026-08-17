import type { FakeSettings } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LogService } from '@/app/core/utilities/log.service'
import { TerminalNavigationGuardService } from '@/app/core/utilities/terminal-navigation-guard.service'
import { TerminalService } from '@/app/core/utilities/terminal.service'
import { HomebridgeLogsWidgetComponent } from '@/app/modules/status/widgets/homebridge-logs-widget/homebridge-logs-widget.component'
import { TerminalWidgetComponent } from '@/app/modules/status/widgets/terminal-widget/terminal-widget.component'
import { makeAuth, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The two terminal widgets: a live Homebridge log, and a shell.
 *
 * They are the dashboard versions of the two full-screen pages and hand the same
 * work to the same services, so what is specific to them is the dashboard
 * context. Two things follow from being one box among many rather than a whole
 * page.
 *
 * The first is focus. A terminal that grabs focus on load scrolls the page down
 * to itself, which on a dashboard means the user lands somewhere other than the
 * top; and a collapsed terminal must not be a tab stop at all. So both widgets
 * have an explicit expand control that owns whether the hidden xterm textarea is
 * reachable.
 *
 * The second is that a search filter set here lives on a service shared with the
 * full Logs page, so the log widget clears it on the way out - otherwise the page
 * opens already filtered with no visible search box to explain why.
 */
describe('the terminal widgets', () => {
  let settings: FakeSettings
  let log: Record<string, any>
  let terminal: Record<string, ReturnType<typeof vi.fn>>
  let navigationGuard: { canDeactivate: ReturnType<typeof vi.fn>, handleBeforeUnload: ReturnType<typeof vi.fn> }
  let resizeEvent: Subject<void>
  let configureEvent: Subject<void>

  /**
   * Build one of the two widgets.
   * @param type - the widget component
   * @param options - how to set it up
   * @param options.settings - settings service overrides
   * @param options.arrange - runs on the freshly built fakes before creation
   */
  async function open<T>(type: new (...args: any[]) => T, options: {
    settings?: Parameters<typeof makeSettings>[0]
    arrange?: () => void
  } = {}) {
    TestBed.resetTestingModule()
    settings = makeSettings(options.settings)
    resizeEvent = new Subject()
    configureEvent = new Subject()

    log = {
      // The log widget reads options off the live terminal to apply font changes
      term: { options: { fontSize: 14, fontWeight: 400 }, scrollToBottom: vi.fn() },
      startTerminal: vi.fn(),
      destroyTerminal: vi.fn(),
      setSearchFilter: vi.fn(),
      clearSearchFilter: vi.fn(),
      scrollToBottom: vi.fn(),
      downloadLogFile: vi.fn(async () => undefined),
      truncateLogFile: vi.fn(async () => undefined),
    }
    terminal = {
      // The shell widget reads options off the live terminal to apply font and
      // theme changes, exactly as the log widget does off its own
      term: { options: { fontSize: 14, fontWeight: 400 }, scrollToBottom: vi.fn() } as any,
      startTerminal: vi.fn(),
      onTouchStart: vi.fn(),
      onTouchEnd: vi.fn(),
      reconnectTerminal: vi.fn(),
      destroyTerminal: vi.fn(),
      detachTerminal: vi.fn(),
      destroyPersistentSession: vi.fn(async () => undefined),
      activateTerminal: vi.fn(),
      isTerminalReady: vi.fn(() => false),
      hasActiveSession: vi.fn(() => false),
    }
    navigationGuard = { canDeactivate: vi.fn(async () => true), handleBeforeUnload: vi.fn() }

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ settings, auth: makeAuth(), toastr: toastrStub() }),
        { provide: LogService, useValue: log },
        { provide: TerminalService, useValue: terminal },
        { provide: TerminalNavigationGuardService, useValue: navigationGuard },
      ],
    })

    TestBed.overrideComponent(type as any, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    options.arrange?.()

    const fixture = TestBed.createComponent(type as any)
    fixture.componentRef.setInput('widget', { component: type.name })
    const instance = fixture.componentInstance as any
    instance.resizeEvent = resizeEvent
    instance.configureEvent = configureEvent

    fixture.detectChanges()
    await fixture.whenStable()

    return { fixture, widget: instance as T }
  }

  /**
   * Let the queued microtasks and frame callbacks run.
   *
   * Both widgets defer their terminal setup to a timer, and the browser stub
   * drives `requestAnimationFrame` off the timer queue too. Under fake timers a
   * real `setTimeout` would never fire, so the clock has to be advanced instead.
   */
  async function flushFrames(): Promise<void> {
    if (vi.isFakeTimers()) {
      await vi.advanceTimersByTimeAsync(0)
      return
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  /**
   * Make the widget report a real size.
   *
   * The terminal widget only acts on a tab change when it is actually on screen,
   * which it decides from `getBoundingClientRect()`. jsdom returns zeros for
   * everything, so without this the visibility check short-circuits and the rules
   * behind it are never reached.
   * @param widget - the terminal widget
   */
  function giveWidgetASize(widget: any): void {
    const container = widget.widgetContainerElement()?.nativeElement as HTMLElement
    container.getBoundingClientRect = () => ({ width: 400, height: 300 }) as DOMRect
  }

  /** An event whose propagation can be stopped. */
  function clickEvent(): Event {
    return { stopPropagation: vi.fn() } as unknown as Event
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the log widget', () => {
    it('follows the effective terminal theme', async () => {
      const dark = await open(HomebridgeLogsWidgetComponent)
      expect(dark.widget.theme()).toBe('dark')

      const light = await open(HomebridgeLogsWidgetComponent, {
        settings: { actualLightingMode: 'light', env: { terminal: { lightingMode: 'light' } } as any },
      })
      expect(light.widget.theme()).toBe('light')
    })

    it('opens a read-only terminal with no blinking cursor', async () => {
      await open(HomebridgeLogsWidgetComponent)
      await flushFrames()

      // A blinking cursor on a log nobody types into just draws the eye, and an
      // enabled stdin makes the hidden textarea a tab stop
      expect(settings.getTerminalOptions).toHaveBeenCalledWith({ cursorBlink: false, disableStdin: true }, true)
      expect(log.startTerminal).toHaveBeenCalled()
    })

    it('ignores resize events until the terminal exists', async () => {
      const { widget } = await open(HomebridgeLogsWidgetComponent)
      const before = widget.terminalHeight()

      resizeEvent.next()

      // Measuring the box before the terminal is in it would set a nonsense
      // height that the first real resize has to undo
      expect(widget.terminalHeight()).toBe(before)
    })

    it('hands the download and truncate buttons to the service', async () => {
      const { widget } = await open(HomebridgeLogsWidgetComponent)

      await widget.downloadLogFile()
      await widget.truncateLogFile()

      expect(log.downloadLogFile).toHaveBeenCalled()
      expect(log.truncateLogFile).toHaveBeenCalled()
    })

    it('clears a search filter it set on the way out', async () => {
      const { widget } = await open(HomebridgeLogsWidgetComponent)
      widget.onSubmit({ query: 'homebridge' })
      expect(widget.showExitButton()).toBe(true)
      log.clearSearchFilter.mockClear()

      TestBed.resetTestingModule()

      // The filter lives on a service the full Logs page shares, so leaving it
      // set opens that page already filtered with nothing to explain why
      expect(log.clearSearchFilter).toHaveBeenCalled()
      expect(log.destroyTerminal).toHaveBeenCalled()
    })

    it('does not clear a filter it never set', async () => {
      await open(HomebridgeLogsWidgetComponent)
      log.clearSearchFilter.mockClear()

      TestBed.resetTestingModule()

      // The user may have a filter running on the Logs page itself
      expect(log.clearSearchFilter).not.toHaveBeenCalled()
    })
  })

  describe('searching from the log widget', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('needs three characters, like the full page', async () => {
      const { widget } = await open(HomebridgeLogsWidgetComponent)

      widget.form.setValue({ query: 'ho' })
      expect(widget.searchInputInvalid).toBe(true)

      widget.form.setValue({ query: 'hom' })
      expect(widget.searchInputInvalid).toBe(false)
    })

    it('searches by itself after the user stops typing', async () => {
      const { widget } = await open(HomebridgeLogsWidgetComponent)

      widget.form.setValue({ query: 'homebridge' })
      await vi.advanceTimersByTimeAsync(500)

      expect(log.setSearchFilter).toHaveBeenCalledWith('homebridge')
      expect(widget.showExitButton()).toBe(true)
    })

    it('trims the query in the box as well as the filter', async () => {
      const { widget } = await open(HomebridgeLogsWidgetComponent)

      widget.form.setValue({ query: '  homebridge  ' })
      await vi.advanceTimersByTimeAsync(500)

      expect(log.setSearchFilter).toHaveBeenCalledWith('homebridge')
      expect(widget.form.value.query).toBe('homebridge')
    })

    it('clears an active search when the query gets too short', async () => {
      const { widget } = await open(HomebridgeLogsWidgetComponent)
      widget.form.setValue({ query: 'homebridge' })
      await vi.advanceTimersByTimeAsync(500)

      widget.form.setValue({ query: 'ho' })
      await vi.advanceTimersByTimeAsync(500)

      expect(log.clearSearchFilter).toHaveBeenCalled()
      expect(widget.showExitButton()).toBe(false)
    })

    it('closes the search box on an empty enter', async () => {
      const { widget } = await open(HomebridgeLogsWidgetComponent)
      widget.showSearch()

      widget.onSubmit({ query: '' })

      // The box takes room from a small widget, so an empty enter gives it back
      expect(widget.showSearchBar()).toBe(false)
    })

    it('clears the filter when the search box is closed', async () => {
      const { widget } = await open(HomebridgeLogsWidgetComponent)
      widget.showSearch()
      widget.form.setValue({ query: 'homebridge' })
      await vi.advanceTimersByTimeAsync(500)

      widget.showSearch()

      expect(widget.showSearchBar()).toBe(false)
      expect(widget.form.value.query).toBe('')
      expect(log.clearSearchFilter).toHaveBeenCalled()
    })

    it('clears the search from the exit button', async () => {
      const { widget } = await open(HomebridgeLogsWidgetComponent)
      widget.form.setValue({ query: 'homebridge' })
      await vi.advanceTimersByTimeAsync(500)

      widget.onClearSearch()

      expect(widget.form.value.query).toBe('')
      expect(widget.showExitButton()).toBe(false)
    })

    it('re-measures itself when the search box opens or closes', async () => {
      const { widget } = await open(HomebridgeLogsWidgetComponent)
      await flushFrames()
      const resized = vi.fn()
      resizeEvent.subscribe(resized)

      widget.showSearch()
      await vi.advanceTimersByTimeAsync(10)

      // The terminal has to shrink to make room, or its last lines fall off the
      // bottom of the widget
      expect(resized).toHaveBeenCalled()
    })
  })

  describe('following the global terminal settings', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('applies a new font size to the live terminal', async () => {
      await open(HomebridgeLogsWidgetComponent)
      await flushFrames()

      settings.terminalSettingsChanged.next({ fontSize: 20 } as any)

      expect(log.term.options.fontSize).toBe(20)
    })

    it('applies a new font weight', async () => {
      await open(HomebridgeLogsWidgetComponent)
      await flushFrames()

      settings.terminalSettingsChanged.next({ fontWeight: 700 } as any)

      expect(log.term.options.fontWeight).toBe(700)
    })

    it('applies a new lighting mode as a whole theme', async () => {
      await open(HomebridgeLogsWidgetComponent)
      await flushFrames()

      settings.terminalSettingsChanged.next({ lightingMode: 'light' } as any)

      // The theme is a block of colours from the settings service, not one value
      expect(settings.getTerminalThemeOptions).toHaveBeenCalledWith(true)
      expect(log.term.options.theme).toBeDefined()
    })

    it('re-measures and scrolls after a change', async () => {
      await open(HomebridgeLogsWidgetComponent)
      await flushFrames()

      settings.terminalSettingsChanged.next({ fontSize: 20 } as any)
      await vi.advanceTimersByTimeAsync(100)

      // A bigger font means fewer lines fit, so the view has to come back to the
      // newest output
      expect(log.term.scrollToBottom).toHaveBeenCalled()
    })

    it('does nothing when the settings have not actually changed', async () => {
      await open(HomebridgeLogsWidgetComponent)
      await flushFrames()

      settings.terminalSettingsChanged.next({ fontSize: 14 } as any)
      await vi.advanceTimersByTimeAsync(100)

      // Same size as it already is: re-fitting the terminal for nothing makes the
      // whole dashboard jump
      expect(log.term.scrollToBottom).not.toHaveBeenCalled()
    })

    it('ignores settings changes before the terminal exists', async () => {
      await open(HomebridgeLogsWidgetComponent)
      log.term = null

      settings.terminalSettingsChanged.next({ fontSize: 20 } as any)

      expect(settings.getTerminalThemeOptions).not.toHaveBeenCalled()
    })
  })

  describe('the shell widget', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('starts a session without stealing focus', async () => {
      await open(TerminalWidgetComponent)
      await vi.advanceTimersByTimeAsync(0)

      // Focusing on load scrolls the page down to a widget that may be well below
      // the fold, so the user lands somewhere they did not choose
      expect(terminal.startTerminal).toHaveBeenCalled()
      expect(terminal.activateTerminal).not.toHaveBeenCalled()
    })

    it('reconnects to a session that is already running', async () => {
      await open(TerminalWidgetComponent, {
        arrange: () => {
          terminal.isTerminalReady = vi.fn(() => true)
        },
      })
      await vi.advanceTimersByTimeAsync(0)

      expect(terminal.reconnectTerminal).toHaveBeenCalled()
      expect(terminal.startTerminal).not.toHaveBeenCalled()
    })

    it('follows the effective terminal theme', async () => {
      const { widget } = await open(TerminalWidgetComponent, {
        settings: { actualLightingMode: 'light', env: { terminal: { lightingMode: 'light' } } as any },
      })

      expect(widget.theme()).toBe('light')
    })

    it('starts collapsed for a screen reader', async () => {
      const { widget } = await open(TerminalWidgetComponent)

      // A shell nobody has asked to use should not be in the tab order of a page
      // of read-only widgets
      expect(widget.srExpanded()).toBe(false)
    })

    it('makes the terminal reachable and focused when expanded', async () => {
      const { widget } = await open(TerminalWidgetComponent)

      widget.toggleSrExpanded(clickEvent())
      await vi.advanceTimersByTimeAsync(0)

      expect(widget.srExpanded()).toBe(true)
      // Now the user has asked for it, so focus is what they want
      expect(terminal.activateTerminal).toHaveBeenCalled()
    })

    it('stops the click reaching the widget behind the button', async () => {
      const { widget } = await open(TerminalWidgetComponent)
      const event = clickEvent()

      widget.toggleSrExpanded(event)

      // The whole widget is clickable to focus the terminal, which would undo
      // what the collapse button just did
      expect(event.stopPropagation).toHaveBeenCalled()
    })

    it('collapses again on a second press', async () => {
      const { widget } = await open(TerminalWidgetComponent)

      widget.toggleSrExpanded(clickEvent())
      await vi.advanceTimersByTimeAsync(0)
      widget.toggleSrExpanded(clickEvent())
      await vi.advanceTimersByTimeAsync(0)

      expect(widget.srExpanded()).toBe(false)
    })

    /**
     * The shell widget follows the same global terminal settings as the log one.
     *
     * ⚠️ **The two widgets carry their own copy of these rules**, against different
     * services — so a change made to one and not the other leaves half the app
     * ignoring the user's font size. These cases are the drift alarm.
     */
    describe('following the global terminal settings', () => {
      beforeEach(() => {
        vi.useFakeTimers()
      })

      it('applies a new font size to the live shell', async () => {
        await open(TerminalWidgetComponent)
        await flushFrames()

        settings.terminalSettingsChanged.next({ fontSize: 20 } as any)

        expect((terminal.term as any).options.fontSize).toBe(20)
      })

      it('applies a new font weight', async () => {
        await open(TerminalWidgetComponent)
        await flushFrames()

        settings.terminalSettingsChanged.next({ fontWeight: 600 } as any)

        expect((terminal.term as any).options.fontWeight).toBe(600)
      })

      it('applies a new lighting mode as a whole theme', async () => {
        // Not just a colour: transparency goes with it, and half-applying leaves
        // unreadable text on the widget background
        await open(TerminalWidgetComponent)
        await flushFrames()

        vi.mocked(settings.getTerminalThemeOptions).mockReturnValue({
          theme: { background: '#ffffff' },
          allowTransparency: true,
        } as any)

        settings.terminalSettingsChanged.next({ lightingMode: 'light' } as any)

        expect(settings.getTerminalThemeOptions).toHaveBeenCalledWith(true)
        expect((terminal.term as any).options.theme).toEqual({ background: '#ffffff' })
        // ⚠️ Both, not just the colours: a solid theme applied without its
        // transparency setting leaves the old background showing through
        expect((terminal.term as any).options.allowTransparency).toBe(true)
      })

      it('re-measures and scrolls after a change', async () => {
        await open(TerminalWidgetComponent)
        await flushFrames()

        settings.terminalSettingsChanged.next({ fontSize: 20 } as any)
        await vi.advanceTimersByTimeAsync(100)

        expect((terminal.term as any).scrollToBottom).toHaveBeenCalled()
      })

      it('does nothing when the settings have not actually changed', async () => {
        await open(TerminalWidgetComponent)
        await flushFrames()

        settings.terminalSettingsChanged.next({ fontSize: 14 } as any)
        await vi.advanceTimersByTimeAsync(100)

        expect((terminal.term as any).scrollToBottom).not.toHaveBeenCalled()
      })

      it('ignores settings changes before the shell exists', async () => {
        await open(TerminalWidgetComponent)
        terminal.term = null as any

        settings.terminalSettingsChanged.next({ fontSize: 20 } as any)

        expect(settings.getTerminalThemeOptions).not.toHaveBeenCalled()
      })
    })

    /**
     * The gestures the widget hands straight to the terminal service.
     *
     * ⚠️ **They are one-line delegations, which is exactly why they break quietly.**
     * A tap that never reaches the service leaves the terminal unfocused with no
     * error anywhere, and a touch the service never sees means the terminal cannot
     * be scrolled on a phone at all.
     */
    describe('the gestures it passes on', () => {
      it('focuses the terminal when the widget is tapped', async () => {
        const { widget } = await open(TerminalWidgetComponent)
        terminal.activateTerminal.mockClear()

        widget.onClick()

        expect(terminal.activateTerminal).toHaveBeenCalled()
      })

      it.each([
        ['onTouchStart', 'onTouchStart'],
        ['onTouchEnd', 'onTouchEnd'],
      ])('hands %s to the terminal, which decides scroll from select', async (method, delegate) => {
        const { widget } = await open(TerminalWidgetComponent)
        const event = { touches: [] } as unknown as TouchEvent

        ;(widget as any)[method](event)

        expect(terminal[delegate]).toHaveBeenCalledWith(event)
      })

      it('asks the guard whether the tab may close', async () => {
        // ⚠️ A shell with something running is lost when the tab closes, and this
        // is the only warning the user gets
        const { widget } = await open(TerminalWidgetComponent)
        const event = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent

        widget.onBeforeUnload(event)

        expect(navigationGuard.handleBeforeUnload).toHaveBeenCalledWith(event)
      })
    })

    /**
     * What a screen reader sees.
     *
     * ⚠️ **xterm builds its own textarea and live region, and neither is written
     * for a widget that starts collapsed.** Left alone, a dashboard of read-only
     * widgets puts a shell input in the tab order, and the live region announces
     * every character of output as it scrolls past.
     */
    describe('what a screen reader sees', () => {
      /**
       * Put xterm's own elements inside the widget's terminal host.
       *
       * These are the two nodes xterm creates: a textarea it reads keystrokes
       * from, and a live region it writes output into. Real xterm is not needed to
       * pin what the widget does to them.
       * @param widget - the terminal widget
       */
      function withXtermElements(widget: any) {
        const host = widget.termTarget()?.nativeElement as HTMLElement
        const textarea = document.createElement('textarea')
        const live = document.createElement('div')
        live.setAttribute('aria-live', 'assertive')
        host.append(textarea, live)
        return { host, textarea, live }
      }

      /** Expand or collapse, and let the deferred patching run. */
      async function toggle(widget: any) {
        widget.toggleSrExpanded(clickEvent())
        await vi.advanceTimersByTimeAsync(0)
      }

      it('keeps the shell input out of the tab order while collapsed', async () => {
        // ⚠️ Otherwise tabbing across the dashboard lands in a live shell
        const { widget } = await open(TerminalWidgetComponent)
        const { textarea } = withXtermElements(widget)

        await toggle(widget)
        await toggle(widget)

        expect(textarea.getAttribute('aria-hidden')).toBe('true')
        expect(textarea.getAttribute('tabindex')).toBe('-1')
      })

      it('puts it back in the tab order when the user expands it', async () => {
        const { widget } = await open(TerminalWidgetComponent)
        const { textarea } = withXtermElements(widget)

        await toggle(widget)

        expect(textarea.hasAttribute('aria-hidden')).toBe(false)
        expect(textarea.hasAttribute('tabindex')).toBe(false)
      })

      it('quietens the live region xterm sets up', async () => {
        // ⚠️ xterm asks for `assertive`, which interrupts the reader for every line
        // of output. Polite means the user hears it when they pause
        const { widget } = await open(TerminalWidgetComponent)
        const { live } = withXtermElements(widget)

        await toggle(widget)

        expect(live.getAttribute('aria-live')).toBe('polite')
        expect(live.getAttribute('role')).toBe('status')
        expect(live.getAttribute('aria-atomic')).toBe('true')
      })

      it('copes with xterm not having built anything yet', async () => {
        // The patching runs on a timer that can beat the terminal into existence
        const { widget } = await open(TerminalWidgetComponent)

        await expect(toggle(widget)).resolves.not.toThrow()
      })

      it('moves focus off the terminal when it is collapsed', async () => {
        // ⚠️ Focus left inside a hidden textarea is a focus trap: the user tabs and
        // nothing appears to happen
        const { widget, fixture } = await open(TerminalWidgetComponent)
        const { textarea } = withXtermElements(widget)
        // Focus only moves for an element that is actually in the document
        fixture.nativeElement.ownerDocument.body.append(fixture.nativeElement)
        textarea.focus()

        await toggle(widget)
        await toggle(widget)

        // The widget's own collapse button, which is where the user just was
        const collapseButton = (widget.titleElement()!.nativeElement as HTMLElement).querySelector('button')
        expect(collapseButton).not.toBeNull()
        expect(document.activeElement).toBe(collapseButton)
      })

      it('leaves focus alone when it was never in the terminal', async () => {
        const { widget } = await open(TerminalWidgetComponent)
        withXtermElements(widget)
        const elsewhere = document.createElement('button')
        document.body.append(elsewhere)
        elsewhere.focus()

        await toggle(widget)
        await toggle(widget)

        expect(document.activeElement).toBe(elsewhere)
        elsewhere.remove()
      })

      it('takes focus back to the terminal when the window is focused again', async () => {
        // Coming back to the tab should put the user where they were typing
        const { widget } = await open(TerminalWidgetComponent)
        await toggle(widget)
        terminal.activateTerminal.mockClear()

        widget.onWindowFocus()

        expect(terminal.activateTerminal).toHaveBeenCalled()
      })

      it('does not steal focus back into a collapsed terminal', async () => {
        const { widget } = await open(TerminalWidgetComponent)
        terminal.activateTerminal.mockClear()

        widget.onWindowFocus()

        expect(terminal.activateTerminal).not.toHaveBeenCalled()
      })
    })

    it('keeps the session alive on the way out when persistence is on', async () => {
      await open(TerminalWidgetComponent, { settings: { env: { terminal: { persistence: true } } as any } })
      await vi.advanceTimersByTimeAsync(0)

      TestBed.resetTestingModule()

      // Switching the widget off on the dashboard should not kill a command the
      // user left running
      expect(terminal.detachTerminal).toHaveBeenCalled()
      expect(terminal.destroyTerminal).not.toHaveBeenCalled()
    })

    it('ends the session on the way out when persistence is off', async () => {
      await open(TerminalWidgetComponent)
      await vi.advanceTimersByTimeAsync(0)

      TestBed.resetTestingModule()

      expect(terminal.destroyTerminal).toHaveBeenCalled()
      expect(terminal.detachTerminal).not.toHaveBeenCalled()
    })

    it('stops listening for tab changes once it is gone', async () => {
      await open(TerminalWidgetComponent)
      await vi.advanceTimersByTimeAsync(0)

      TestBed.resetTestingModule()
      terminal.activateTerminal.mockClear()
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(200)

      expect(terminal.activateTerminal).not.toHaveBeenCalled()
    })

    it('does not focus on a tab change while collapsed', async () => {
      const { widget } = await open(TerminalWidgetComponent, {
        arrange: () => {
          terminal.isTerminalReady = vi.fn(() => true)
        },
      })
      await vi.advanceTimersByTimeAsync(0)
      // jsdom gives every element a zero-size rect, so without this the widget
      // reads as off-screen and the collapsed check below is never reached
      giveWidgetASize(widget)
      terminal.activateTerminal.mockClear()

      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(200)

      // Coming back to the browser tab must not pull focus into a terminal the
      // user has not expanded
      expect(terminal.activateTerminal).not.toHaveBeenCalled()
    })

    it('focuses on a tab change once expanded', async () => {
      const { widget } = await open(TerminalWidgetComponent, {
        arrange: () => {
          terminal.isTerminalReady = vi.fn(() => true)
        },
      })
      await vi.advanceTimersByTimeAsync(0)
      giveWidgetASize(widget)
      widget.toggleSrExpanded(clickEvent())
      await vi.advanceTimersByTimeAsync(0)
      terminal.activateTerminal.mockClear()

      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(200)

      expect(terminal.activateTerminal).toHaveBeenCalled()
    })

    it('ignores a tab change for a widget that is not on screen', async () => {
      const { widget } = await open(TerminalWidgetComponent, {
        arrange: () => {
          terminal.isTerminalReady = vi.fn(() => true)
        },
      })
      await vi.advanceTimersByTimeAsync(0)
      widget.toggleSrExpanded(clickEvent())
      await vi.advanceTimersByTimeAsync(0)
      terminal.activateTerminal.mockClear()

      // Left at zero size: a widget hidden on this screen size must not grab
      // focus from whatever the user can actually see
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(200)

      expect(terminal.activateTerminal).not.toHaveBeenCalled()
    })
  })
})
