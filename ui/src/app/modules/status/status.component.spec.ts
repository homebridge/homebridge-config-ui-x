import type { FakeIoNamespace, FakeModalService, FakeSettings, FakeWs } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NotificationService } from '@/app/core/communication/notification.service'
import { WIDGET_CONTROL_MODAL_DATA, WIDGET_VISIBILITY_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { TerminalNavigationGuardService } from '@/app/core/utilities/terminal-navigation-guard.service'
import { CreditsComponent } from '@/app/modules/status/credits/credits.component'
import { StatusComponent } from '@/app/modules/status/status.component'
import { WidgetControlComponent } from '@/app/modules/status/widget-control/widget-control.component'
import { WidgetVisibilityComponent } from '@/app/modules/status/widget-visibility/widget-visibility.component'
import { AVAILABLE_WIDGETS } from '@/app/modules/status/widgets/widgets.component'
import { fakeWs, locationReload, makeAuth, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The status page - the dashboard the user lands on.
 *
 * It is a grid of widgets whose positions are saved on the server, and most of
 * the interesting behaviour is about that layout: it is loaded over the
 * websocket rather than HTTP, the "loaded" flag is only set once the layout has
 * actually been applied so a dropped acknowledgement retries on the next
 * reconnect, and there is a whole keyboard reordering mode that exists because a
 * drag-and-drop grid is unusable with a screen reader.
 */
describe('statusComponent', () => {
  let settings: FakeSettings
  let toastr: ReturnType<typeof toastrStub>
  let ws: FakeWs
  let io: FakeIoNamespace
  let modal: FakeModalService
  let notification: NotificationService
  let navigationGuard: { canDeactivate: ReturnType<typeof vi.fn>, handleBeforeUnload: ReturnType<typeof vi.fn> }

  /**
   * A saved widget as the layout endpoint returns it.
   * @param component - the widget's component name
   * @param overrides - fields to change
   */
  function widget(component: string, overrides: Record<string, any> = {}) {
    return { x: 0, y: 0, cols: 5, rows: 5, component, mobileOrder: 0, ...overrides }
  }

  /**
   * Build the page.
   * @param options - how to set it up
   * @param options.layout - the saved widget layout
   * @param options.rpiThrottled - the throttle report from the server
   * @param options.failLoad - make the layout request error
   * @param options.connected - whether the socket starts connected
   * @param options.admin - whether the signed-in user is an admin
   * @param options.matterSupport - whether the running homebridge speaks matter
   * @param options.enableAccessories - whether accessory control is switched on
   */
  async function open(options: {
    layout?: any[]
    rpiThrottled?: Record<string, boolean>
    failLoad?: boolean
    connected?: boolean
    admin?: boolean
    matterSupport?: boolean
    enableAccessories?: boolean
  } = {}) {
    TestBed.resetTestingModule()
    settings = makeSettings({
      env: {
        enableAccessories: options.enableAccessories ?? true,
        featureFlags: { matterSupport: options.matterSupport ?? true },
      },
    })
    toastr = toastrStub()
    ws = fakeWs()
    io = ws.namespace('status', { connected: options.connected ?? true })
    modal = modalServiceSpy()
    navigationGuard = { canDeactivate: vi.fn(async () => true), handleBeforeUnload: vi.fn(() => 'stay') }

    io.socket.respondTo('get-dashboard-init', options.failLoad
      ? { error: 'no layout' }
      : { layout: options.layout ?? [], rpiThrottled: options.rpiThrottled })
    io.socket.respondTo('set-dashboard-layout', {})

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ settings, toastr, ws, modal, auth: makeAuth({ user: { admin: options.admin ?? true } }) }),
        { provide: TerminalNavigationGuardService, useValue: navigationGuard },
      ],
    })

    // The grid is gridster's, and every widget has its own spec
    TestBed.overrideComponent(StatusComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    notification = TestBed.inject(NotificationService)

    const fixture = TestBed.createComponent(StatusComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }

    return fixture.componentInstance
  }

  /** The layout most recently sent to the server. */
  function savedLayout(): any[] {
    return io.requests.filter(request => request.resource === 'set-dashboard-layout').at(-1)?.payload
  }

  beforeEach(() => {
    locationReload.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('loading the dashboard', () => {
    it('shows the instance name rather than a page name', async () => {
      await open()

      // Called with nothing: the status page is the one screen titled after the
      // Homebridge instance itself
      expect(settings.setPageTitle).toHaveBeenCalledWith()
    })

    it('asks the socket for the saved layout', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent'), widget('MemoryWidgetComponent')] })

      expect(page.dashboard().map(item => item.component)).toEqual(['CpuWidgetComponent', 'MemoryWidgetComponent'])
    })

    it('reports the console as up once the socket connects', async () => {
      const page = await open()

      expect(page.consoleStatus()).toBe('up')
    })

    it('reports the console as down before it connects', async () => {
      const page = await open({ connected: false })

      // The dot in the corner is the only sign the page has lost the server
      expect(page.consoleStatus()).toBe('down')
      expect(page.dashboard()).toEqual([])
    })

    it('reports the console as down again when the socket drops', async () => {
      const page = await open()

      io.socket.fire('disconnect')

      expect(page.consoleStatus()).toBe('down')
    })

    it('loads the layout on the connect that arrives late', async () => {
      const page = await open({ connected: false, layout: [widget('CpuWidgetComponent')] })

      io.markConnected()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      expect(page.dashboard().map(item => item.component)).toEqual(['CpuWidgetComponent'])
    })

    it('tries again on the next connect when the first load fails', async () => {
      const page = await open({ failLoad: true })
      expect(toastr.at('error')).toHaveLength(1)

      io.socket.respondTo('get-dashboard-init', { layout: [widget('CpuWidgetComponent')] })
      io.markConnected()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      // The flag is only set once the layout has been applied, so a dropped
      // acknowledgement does not leave the dashboard permanently empty
      expect(page.dashboard().map(item => item.component)).toEqual(['CpuWidgetComponent'])
    })

    it('does not reload the layout on a reconnect', async () => {
      await open({ layout: [widget('CpuWidgetComponent')] })

      io.markConnected()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      // Reapplying it would undo anything the user has moved since
      expect(io.requests.filter(request => request.resource === 'get-dashboard-init')).toHaveLength(2)
      expect(io.requests.filter(request => request.resource === 'set-dashboard-layout')).toHaveLength(0)
    })

    it('raises the raspberry pi throttle warning', async () => {
      await open({ rpiThrottled: { UnderVoltage: true } })

      expect(notification.raspberryPiThrottled()).toEqual({ UnderVoltage: true })
    })

    it('reloads the page when the server is running different code', async () => {
      await open()

      io.socket.fire('homebridge-status', { packageVersion: '99.0.0' })

      // The bundle this page was served from no longer matches the server, so
      // its socket contract may not either
      expect(locationReload).toHaveBeenCalled()
    })

    it('stays put when the versions agree', async () => {
      await open()

      io.socket.fire('homebridge-status', { packageVersion: settings.uiVersion })

      expect(locationReload).not.toHaveBeenCalled()
    })
  })

  describe('unlocking the grid', () => {
    it('starts locked', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })

      // A dashboard that rearranges itself on a stray drag is worse than one
      // that needs a button pressed first
      expect(page.options.draggable?.enabled).toBe(false)
      expect(page.options.resizable?.enabled).toBe(false)
    })

    it('allows dragging and resizing when unlocked', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })

      page.unlockLayout()

      expect(page.options.draggable?.enabled).toBe(true)
      expect(page.options.resizable?.enabled).toBe(true)
    })

    it('marks the widgets undraggable again when locked', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })
      page.unlockLayout()
      expect(page.dashboard()[0].draggable).toBe(true)

      page.lockLayout()

      // Each widget carries its own draggable flag for gridster, so flipping the
      // grid option alone would leave them all still draggable
      expect(page.options.draggable?.enabled).toBe(false)
      expect(page.dashboard()[0].draggable).toBe(false)
    })

    it('does not write the layout just for locking', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })
      page.unlockLayout()

      page.lockLayout()

      // Nothing has moved, so there is nothing to save; the write happens when
      // gridster reports a change, when a widget asks, or on leaving reorder mode
      expect(savedLayout()).toBeUndefined()
    })

    it('saves a reorder in progress rather than discarding it', async () => {
      vi.useFakeTimers()
      const page = await open({
        layout: [widget('CpuWidgetComponent'), widget('MemoryWidgetComponent', { mobileOrder: 1 })],
      })
      page.unlockLayout()
      page.toggleReorderMode()
      page.moveComponent('MemoryWidgetComponent', -1)

      page.lockLayout()

      // Locking means "I am done", so an unsaved reorder is applied rather than
      // thrown away
      expect(page.reorderMode()).toBe(false)
      expect(savedLayout().map((item: any) => item.component)).toEqual(['MemoryWidgetComponent', 'CpuWidgetComponent'])
    })
  })

  describe('saving the layout', () => {
    it('strips the private event streams before sending', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })

      page.saveWidgetsEvent.next(undefined)
      await Promise.resolve()

      // The widgets carry rxjs Subjects for their own communication, and those
      // cannot be serialised onto the socket
      const [saved] = savedLayout()
      expect(saved.$resizeEvent).toBeUndefined()
      expect(saved.$configureEvent).toBeUndefined()
      expect(saved.$saveWidgetsEvent).toBeUndefined()
      expect(saved.component).toBe('CpuWidgetComponent')
    })

    it('sorts by the mobile order so the phone layout matches', async () => {
      const page = await open({
        layout: [
          widget('CpuWidgetComponent', { mobileOrder: 2 }),
          widget('MemoryWidgetComponent', { mobileOrder: 0 }),
          widget('NetworkWidgetComponent', { mobileOrder: 1 }),
        ],
      })

      page.saveWidgetsEvent.next(undefined)
      await Promise.resolve()

      expect(page.dashboard().map(item => item.component))
        .toEqual(['MemoryWidgetComponent', 'NetworkWidgetComponent', 'CpuWidgetComponent'])
    })

    it('saves when a widget asks it to', async () => {
      const page = await open({ layout: [widget('AccessoriesWidgetComponent')] })

      page.saveWidgetsEvent.next(undefined)
      await Promise.resolve()

      // The accessories widget reorders its own contents, and that is part of
      // the saved layout
      expect(savedLayout()).toBeDefined()
    })

    it('keeps going when the save is refused', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })
      io.socket.respondTo('set-dashboard-layout', { error: 'read only' })

      page.saveWidgetsEvent.next(undefined)
      await Promise.resolve()

      // Logged rather than shown: the user has not asked for anything, this is a
      // background write
      expect(toastr.at('error')).toHaveLength(0)
    })
  })

  describe('choosing which widgets to show', () => {
    it('opens the visibility modal with the current dashboard', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })

      const done = page.addWidget()

      expect(modal.lastOpened()?.content).toBe(WidgetVisibilityComponent)
      expect(modal.dataFor(WIDGET_VISIBILITY_MODAL_DATA)?.dashboard).toHaveLength(1)
      modal.lastOpened()!.ref.dismiss('Dismiss')
      await done
    })

    it('adds a newly visible widget at the bottom', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent', { y: 0, rows: 5 })] })

      const done = page.addWidget()
      modal.lastOpened()!.ref.close([
        { component: 'MemoryWidgetComponent', showOnDesktop: true, showOnMobile: true, cols: 5, rows: 5, mobileOrder: 1 },
      ])
      await done

      // Placed below everything else so turning a widget on does not shove the
      // user's arrangement around
      const added = page.dashboard().find(item => item.component === 'MemoryWidgetComponent')
      expect(added?.y).toBe(5)
    })

    it('removes a widget hidden on both desktop and mobile', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent'), widget('MemoryWidgetComponent')] })

      const done = page.addWidget()
      modal.lastOpened()!.ref.close([
        { component: 'MemoryWidgetComponent', showOnDesktop: false, showOnMobile: false, cols: 5, rows: 5, mobileOrder: 1 },
      ])
      await done

      expect(page.dashboard().map(item => item.component)).toEqual(['CpuWidgetComponent'])
    })

    it('keeps a widget that is hidden on only one of the two', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })

      const done = page.addWidget()
      modal.lastOpened()!.ref.close([
        {
          component: 'CpuWidgetComponent',
          showOnDesktop: false,
          showOnMobile: true,
          hideOnDesktop: true,
          cols: 5,
          rows: 5,
          mobileOrder: 0,
        },
      ])
      await done

      // Still in the layout, just not drawn on the wider screen
      expect(page.dashboard()).toHaveLength(1)
      expect(page.dashboard()[0].hideOnDesktop).toBe(true)
    })

    it('keeps the event streams of a widget when its visibility changes', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })
      const before = page.dashboard()[0].$resizeEvent

      const done = page.addWidget()
      modal.lastOpened()!.ref.close([
        { component: 'CpuWidgetComponent', showOnDesktop: true, showOnMobile: true, cols: 5, rows: 5, mobileOrder: 0 },
      ])
      await done

      // The widget instance is not rebuilt, so replacing its Subjects would
      // leave it listening to one nothing writes to
      expect(page.dashboard()[0].$resizeEvent).toBe(before)
    })

    it('changes nothing when the modal is dismissed', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })

      const done = page.addWidget()
      modal.lastOpened()!.ref.dismiss('Dismiss')
      await done

      expect(page.dashboard().map(item => item.component)).toEqual(['CpuWidgetComponent'])
      expect(savedLayout()).toBeUndefined()
    })
  })

  describe('the settings of a single widget', () => {
    it('opens the control modal for that widget', async () => {
      const page = await open({ layout: [widget('WeatherWidgetComponent')] })

      const done = page.manageWidget(page.dashboard()[0])

      expect(modal.lastOpened()?.content).toBe(WidgetControlComponent)
      expect(modal.dataFor(WIDGET_CONTROL_MODAL_DATA)?.widget.component).toBe('WeatherWidgetComponent')
      modal.lastOpened()!.ref.dismiss('Dismiss')
      await done
    })

    it('tells the widget to re-read its configuration', async () => {
      const page = await open({ layout: [widget('WeatherWidgetComponent')] })
      const configured = vi.fn()
      page.dashboard()[0].$configureEvent.subscribe(configured)

      const done = page.manageWidget(page.dashboard()[0])
      modal.lastOpened()!.ref.close()
      await done
      await Promise.resolve()

      // Deferred to a microtask: setting it during the same change detection
      // pass raises NG0100
      expect(configured).toHaveBeenCalled()
    })

    it('finds the widget by component name', async () => {
      const page = await open({ layout: [widget('WeatherWidgetComponent')] })

      page.manageWidgetByComponent('WeatherWidgetComponent')

      expect(modal.lastOpened()?.content).toBe(WidgetControlComponent)
      modal.lastOpened()!.ref.dismiss('Dismiss')
    })

    it('does nothing for a widget that is not on the dashboard', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })

      page.manageWidgetByComponent('WeatherWidgetComponent')

      expect(modal.opened).toHaveLength(0)
    })

    it('opens the credits', async () => {
      const page = await open()

      page.openCreditsModal()

      expect(modal.lastOpened()?.content).toBe(CreditsComponent)
    })
  })

  describe('reordering with the keyboard', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    /**
     * Build the page with three widgets in a known order.
     */
    function openThree() {
      return open({
        layout: [
          widget('CpuWidgetComponent', { mobileOrder: 0 }),
          widget('MemoryWidgetComponent', { mobileOrder: 1 }),
          widget('NetworkWidgetComponent', { mobileOrder: 2 }),
        ],
      })
    }

    it('selects the first widget and offers the instructions', async () => {
      const page = await openThree()

      page.toggleReorderMode()

      // The instructions are the first widget's accessible description, so they
      // are read straight after its name rather than racing a live region
      expect(page.reorderMode()).toBe(true)
      expect(page.selectedReorderComponent()).toBe('CpuWidgetComponent')
      expect(page.showReorderHelp()).toBe(true)
    })

    it('moves the selected widget up and down', async () => {
      const page = await openThree()
      page.toggleReorderMode()

      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }))

      expect(page.dashboard().map(item => item.component))
        .toEqual(['MemoryWidgetComponent', 'CpuWidgetComponent', 'NetworkWidgetComponent'])

      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }))

      expect(page.dashboard().map(item => item.component))
        .toEqual(['CpuWidgetComponent', 'MemoryWidgetComponent', 'NetworkWidgetComponent'])
    })

    it('renumbers the mobile order after a move', async () => {
      const page = await openThree()
      page.toggleReorderMode()

      page.moveComponent('NetworkWidgetComponent', -1)

      // The rendered order comes from mobileOrder, so leaving it stale would
      // show a different order from the list the user is editing
      expect(page.dashboard().map(item => item.mobileOrder)).toEqual([0, 1, 2])
      expect(page.dashboard().map(item => item.component))
        .toEqual(['CpuWidgetComponent', 'NetworkWidgetComponent', 'MemoryWidgetComponent'])
    })

    it('refuses to move the first widget up', async () => {
      const page = await openThree()
      page.toggleReorderMode()

      expect(page.moveComponent('CpuWidgetComponent', -1)).toBe(false)
      expect(page.dashboard()[0].component).toBe('CpuWidgetComponent')
    })

    it('refuses to move the last widget down', async () => {
      const page = await openThree()
      page.toggleReorderMode()

      expect(page.moveComponent('NetworkWidgetComponent', 1)).toBe(false)
    })

    it('refuses to move a widget that is not there', async () => {
      const page = await openThree()
      page.toggleReorderMode()

      expect(page.moveComponent('WeatherWidgetComponent', 1)).toBe(false)
    })

    it('sends a widget to the top and the bottom', async () => {
      const page = await openThree()
      page.toggleReorderMode()
      page.setSelectedReorderComponent('NetworkWidgetComponent')

      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'Home' }))
      expect(page.dashboard()[0].component).toBe('NetworkWidgetComponent')

      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'End' }))
      expect(page.dashboard().at(-1)!.component).toBe('NetworkWidgetComponent')
    })

    it('moves the selection with tab, wrapping round the ends', async () => {
      const page = await openThree()
      page.toggleReorderMode()

      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'Tab' }))
      expect(page.selectedReorderComponent()).toBe('MemoryWidgetComponent')

      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))
      expect(page.selectedReorderComponent()).toBe('CpuWidgetComponent')

      // Wrapping keeps the user inside the list instead of tabbing out of the
      // mode they are in
      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))
      expect(page.selectedReorderComponent()).toBe('NetworkWidgetComponent')
    })

    it('drops the instructions after the first keypress', async () => {
      const page = await openThree()
      page.toggleReorderMode()

      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'Tab' }))

      // They only need reading once, and repeating them on every arrow press
      // would drown out the position announcements
      expect(page.showReorderHelp()).toBe(false)
    })

    it.each([
      ['Home', ['NetworkWidgetComponent', 'CpuWidgetComponent', 'MemoryWidgetComponent']],
      ['ArrowLeft', ['NetworkWidgetComponent', 'CpuWidgetComponent', 'MemoryWidgetComponent']],
    ])('sends the widget to the top on %s', async (key, expected) => {
      // A long dashboard would otherwise need one arrow press per position
      const page = await openThree()
      page.toggleReorderMode()
      page.setSelectedReorderComponent('NetworkWidgetComponent')

      page.onReorderKeydown(new KeyboardEvent('keydown', { key }))

      expect(page.dashboard().map(item => item.component)).toEqual(expected)
    })

    it.each([
      ['End', ['MemoryWidgetComponent', 'NetworkWidgetComponent', 'CpuWidgetComponent']],
      ['ArrowRight', ['MemoryWidgetComponent', 'NetworkWidgetComponent', 'CpuWidgetComponent']],
    ])('sends the widget to the bottom on %s', async (key, expected) => {
      const page = await openThree()
      page.toggleReorderMode()

      page.onReorderKeydown(new KeyboardEvent('keydown', { key }))

      expect(page.dashboard().map(item => item.component)).toEqual(expected)
    })

    it('moves the selection down the list on tab', async () => {
      const page = await openThree()
      page.toggleReorderMode()

      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'Tab' }))

      expect(page.selectedReorderComponent()).toBe('MemoryWidgetComponent')
    })

    it('moves it back up on shift tab', async () => {
      const page = await openThree()
      page.toggleReorderMode()
      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'Tab' }))

      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))

      expect(page.selectedReorderComponent()).toBe('CpuWidgetComponent')
    })

    it('wraps round the end of the list', async () => {
      // ⚠️ Tab is the only way through the list here, so stopping at the end would
      // leave the first widget unreachable without leaving the mode
      const page = await openThree()
      page.toggleReorderMode()

      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'Tab' }))
      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'Tab' }))
      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'Tab' }))

      expect(page.selectedReorderComponent()).toBe('CpuWidgetComponent')
    })

    it('leaves the mode on escape, keeping the changes', async () => {
      const page = await openThree()
      page.toggleReorderMode()
      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }))

      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'Escape' }))

      // ⚠️ Escape means "I am finished", not "undo": the moves have already been
      // announced as done, so throwing them away here would contradict that
      expect(page.reorderMode()).toBe(false)
      expect(savedLayout().map((item: any) => item.component))
        .toEqual(['MemoryWidgetComponent', 'CpuWidgetComponent', 'NetworkWidgetComponent'])
    })

    it.each([
      ['a key it does not use', 'a'],
      ['the space bar', ' '],
      ['enter', 'Enter'],
    ])('lets %s through to the page', async (_case, key) => {
      // ⚠️ Swallowing everything would make the mode a keyboard trap
      const page = await openThree()
      page.toggleReorderMode()
      const event = new KeyboardEvent('keydown', { key })
      const preventDefault = vi.spyOn(event, 'preventDefault')

      page.onReorderKeydown(event)

      expect(preventDefault).not.toHaveBeenCalled()
    })

    it.each(['ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab', 'Escape'])('takes %s for itself', async (key) => {
      // Otherwise arrow keys scroll the page underneath and tab leaves the list
      const page = await openThree()
      page.toggleReorderMode()
      const event = new KeyboardEvent('keydown', { key })
      const preventDefault = vi.spyOn(event, 'preventDefault')
      const stopPropagation = vi.spyOn(event, 'stopPropagation')

      page.onReorderKeydown(event)

      expect(preventDefault).toHaveBeenCalled()
      expect(stopPropagation).toHaveBeenCalled()
    })

    it('moves the keyboard focus onto the selected widget', async () => {
      // ⚠️ The selection is only announced because focus follows it. Without this
      // the reader stays on whatever was focused when the mode was entered and
      // says nothing as the user tabs.
      //
      // ⚠️ Called directly rather than by advancing the timer it is queued on:
      // running the timers here forces a render of the real template, which dies
      // on a directive this spec deliberately does not import
      const page = await openThree()
      const item = document.createElement('button')
      item.id = 'reorder-item-MemoryWidgetComponent'
      document.body.append(item)

      ;(page as any).focusReorderItem('MemoryWidgetComponent')

      expect(document.activeElement).toBe(item)
      item.remove()
    })

    it('carries on when the widget has not been rendered yet', async () => {
      const page = await openThree()

      expect(() => (page as any).focusReorderItem('MemoryWidgetComponent')).not.toThrow()
    })

    it('ignores keys when not reordering', async () => {
      const page = await openThree()

      page.onReorderKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }))

      expect(page.dashboard()[0].component).toBe('CpuWidgetComponent')
    })

    it('ignores a selection request for a widget that is not there', async () => {
      const page = await openThree()
      page.toggleReorderMode()

      page.setSelectedReorderComponent('WeatherWidgetComponent')

      expect(page.selectedReorderComponent()).toBe('CpuWidgetComponent')
    })

    it('saves and announces when the mode is left', async () => {
      const page = await openThree()
      page.toggleReorderMode()
      page.moveComponent('MemoryWidgetComponent', -1)

      page.toggleReorderMode()

      expect(page.reorderMode()).toBe(false)
      expect(page.selectedReorderComponent()).toBeNull()
      expect(page.actionLiveMessage()).toContain('status.reorder.disabled')
      expect(savedLayout().map((item: any) => item.component))
        .toEqual(['MemoryWidgetComponent', 'CpuWidgetComponent', 'NetworkWidgetComponent'])
    })

    it('re-announces the same message twice in a row', async () => {
      const page = await openThree()
      page.toggleReorderMode()

      page.moveComponent('MemoryWidgetComponent', -1)
      const first = page.actionLiveMessage()
      page.moveComponent('MemoryWidgetComponent', 1)
      page.moveComponent('MemoryWidgetComponent', -1)

      // An unchanged live region is not read again, so an invisible character is
      // added to force it
      expect(page.actionLiveMessage()).not.toBe(first)
      expect(page.actionLiveMessage()).toContain('status.reorder.moved')
    })

    it('names the widgets in a way a screen reader can read', async () => {
      const page = await openThree()

      // Component names are not something to read aloud
      expect(page.getWidgetDisplayName('CpuWidgetComponent')).toBe('status.cpu.title_cpu')
      expect(page.getWidgetDisplayName('AccessoriesWidgetComponent')).toBe('menu.label_accessories')
      expect(page.getReorderItemAriaLabel('CpuWidgetComponent')).toBe('status.reorder.item_label')
    })
  })

  describe('leaving the page with a terminal widget', () => {
    it('leaves freely when there is no terminal widget', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })

      expect(page.canDeactivate()).toBe(true)
      expect(navigationGuard.canDeactivate).not.toHaveBeenCalled()
    })

    it('asks the guard when a terminal widget is on the dashboard', async () => {
      const page = await open({ layout: [widget('TerminalWidgetComponent')] })

      await expect(page.canDeactivate()).resolves.toBe(true)

      // A terminal widget may have a command running, which navigating away
      // would kill
      expect(navigationGuard.canDeactivate).toHaveBeenCalled()
    })

    it('warns before the browser tab closes on a terminal widget', async () => {
      const page = await open({ layout: [widget('TerminalWidgetComponent')] })
      const event = new Event('beforeunload') as BeforeUnloadEvent

      expect(page.onBeforeUnload(event)).toBe('stay')
    })

    it('says nothing before the tab closes without one', async () => {
      const page = await open({ layout: [widget('CpuWidgetComponent')] })

      expect(page.onBeforeUnload(new Event('beforeunload') as BeforeUnloadEvent)).toBeUndefined()
      expect(navigationGuard.handleBeforeUnload).not.toHaveBeenCalled()
    })
  })

  /**
   * Naming a widget for a screen reader.
   *
   * ⚠️ **The reorder controls announce widgets by name.** Without a name a blind
   * user hears "move up, move up, move up" with nothing to tell the rows apart, so
   * every widget in the registry needs one — and a widget added later has to fall
   * back to something readable rather than its class name.
   */
  describe('naming the widgets', () => {
    it.each([
      ['UpdateInfoWidgetComponent', 'status.services.updates'],
      ['WeatherWidgetComponent', 'status.widget.weather.title_weather'],
      ['AccessoriesWidgetComponent', 'menu.label_accessories'],
      ['BridgesWidgetComponent', 'child_bridge.bridges'],
      ['CpuWidgetComponent', 'status.cpu.title_cpu'],
      ['MemoryWidgetComponent', 'status.memory.title_memory'],
      ['NetworkWidgetComponent', 'status.network.title_network'],
      ['UptimeWidgetComponent', 'status.uptime.title_uptime'],
      ['SystemInfoWidgetComponent', 'status.widget.info'],
      ['HapQrcodeWidgetComponent', 'status.widget.add.label_pairing_code'],
      ['MatterQrcodeWidgetComponent', 'status.widget.add.matter_pairing_code'],
      ['HomebridgeLogsWidgetComponent', 'status.widget.homebridge_logs'],
      ['ClockWidgetComponent', 'status.widget.clock'],
    ])('names %s', async (component, expected) => {
      const page = await open()

      expect(page.getWidgetDisplayName(component)).toBe(expected)
    })

    it('names the terminal widget after homebridge', async () => {
      const page = await open()

      expect(page.getWidgetDisplayName('TerminalWidgetComponent')).toBe('Homebridge menu.docker.terminal')
    })

    it('gives every widget in the registry a name of its own', async () => {
      // ⚠️ The check that matters: a widget added to the registry without a case
      // here falls through to the class-name fallback, which reads badly
      const page = await open()

      const fallbacks = AVAILABLE_WIDGETS.filter(component =>
        page.getWidgetDisplayName(component).includes(' Widget')
        || page.getWidgetDisplayName(component) === component,
      )

      expect(fallbacks).toEqual([])
    })

    it('makes a readable name out of an unknown widget', async () => {
      // A layout saved by a newer version can name a widget this one lacks
      const page = await open()

      expect(page.getWidgetDisplayName('SomeNewThingWidgetComponent')).toBe('Some New Thing')
    })

    it('falls back to the raw name when there is nothing to split', async () => {
      const page = await open()

      expect(page.getWidgetDisplayName('WidgetComponent')).toBe('WidgetComponent')
    })

    it('announces the position of a widget being reordered', async () => {
      const page = await open({
        layout: [
          { component: 'CpuWidgetComponent', x: 0, y: 0, cols: 2, rows: 2 },
          { component: 'MemoryWidgetComponent', x: 2, y: 0, cols: 2, rows: 2 },
        ],
      })

      expect(page.getReorderItemAriaLabel('MemoryWidgetComponent')).toBe('status.reorder.item_label')
    })

    it('names the settings button after the widget it belongs to', async () => {
      const page = await open()

      expect(page.getWidgetSettingsAriaLabel({ component: 'CpuWidgetComponent' })).toBe('status.reorder.widget_settings')
    })

    it('copes with a settings button for nothing in particular', async () => {
      const page = await open()

      expect(() => page.getWidgetSettingsAriaLabel({})).not.toThrow()
    })
  })

  /**
   * Loading a saved dashboard.
   *
   * ⚠️ **Old layouts name widgets that have been renamed since.** They are migrated
   * on load and the layout is saved back, or the migration runs on every page load
   * for ever. Widgets the user may not have — the terminal for a non-admin, the
   * matter code on a homebridge without matter — are dropped instead.
   */
  describe('applying a saved layout', () => {
    const item = (component: string) => ({ component, x: 0, y: 0, cols: 2, rows: 2 })

    it('renames a widget that was renamed in an update', async () => {
      const page = await open({ layout: [item('HomebridgeStatusWidgetComponent')] })

      expect(page.dashboard().map((w: any) => w.component)).toEqual(['UpdateInfoWidgetComponent'])
    })

    it('renames the old child bridge widget too', async () => {
      const page = await open({ layout: [item('ChildBridgeWidgetComponent')] })

      expect(page.dashboard().map((w: any) => w.component)).toEqual(['BridgesWidgetComponent'])
    })

    it.each([
      ['the terminal widget from a non-admin', 'TerminalWidgetComponent', { admin: false }],
      ['the matter qr code when matter is off', 'MatterQrcodeWidgetComponent', { matterSupport: false }],
      ['the accessories widget when accessory control is off', 'AccessoriesWidgetComponent', { enableAccessories: false }],
    ])('hides %s', async (_case, component, options) => {
      // ⚠️ A widget the user is not allowed to use must not be built at all. It
      // would render an error, or in the terminal's case put a shell on the
      // dashboard of someone with no terminal permission
      const page = await open({ layout: [widget(component), widget('CpuWidgetComponent')], ...options })

      expect(page.dashboard().map(item => item.component)).toEqual(['CpuWidgetComponent'])
    })

    it.each([
      ['the terminal widget for an admin', 'TerminalWidgetComponent', { admin: true }],
      ['the matter qr code when matter is on', 'MatterQrcodeWidgetComponent', { matterSupport: true }],
      ['the accessories widget when accessory control is on', 'AccessoriesWidgetComponent', { enableAccessories: true }],
    ])('keeps %s', async (_case, component, options) => {
      const page = await open({ layout: [widget(component)], ...options })

      expect(page.dashboard().map(item => item.component)).toEqual([component])
    })

    it('saves the layout back after migrating it', async () => {
      // ⚠️ Otherwise the rename runs again on every single page load
      await open({ layout: [item('HomebridgeStatusWidgetComponent')] })

      expect(savedLayout()?.map((w: any) => w.component)).toEqual(['UpdateInfoWidgetComponent'])
    })

    it('does not save a layout that needed no migration', async () => {
      await open({ layout: [item('CpuWidgetComponent')] })

      expect(savedLayout()).toBeUndefined()
    })

    it('drops a widget this version does not have', async () => {
      const page = await open({ layout: [item('CpuWidgetComponent'), item('SomeWidgetFromTheFuture')] })

      expect(page.dashboard().map((w: any) => w.component)).toEqual(['CpuWidgetComponent'])
    })

    it('gives every widget its event streams', async () => {
      // The widget host completes these on destroy, so they have to exist
      const page = await open({ layout: [item('CpuWidgetComponent')] })

      expect(page.dashboard()[0].$resizeEvent).toBeDefined()
      expect(page.dashboard()[0].$configureEvent).toBeDefined()
      expect(page.dashboard()[0].$saveWidgetsEvent).toBeDefined()
    })

    it('falls back to the default layout when the server has none', async () => {
      const page = await open({ layout: [] })

      expect(page.dashboard().length).toBeGreaterThan(0)
    })
  })
})
