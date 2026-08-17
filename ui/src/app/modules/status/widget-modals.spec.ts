import type { FakeApi, FakeIoNamespace, FakeSettings, FakeWs } from '@/testing'

import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WIDGET_CONTROL_MODAL_DATA, WIDGET_VISIBILITY_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { WidgetControlComponent } from '@/app/modules/status/widget-control/widget-control.component'
import { WidgetVisibilityComponent } from '@/app/modules/status/widget-visibility/widget-visibility.component'
import { activeModalStub, fakeApi, fakeWs, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The two modals that configure the dashboard.
 *
 * The visibility modal decides which widgets exist at all, and stores the
 * decision inverted: the checkboxes are "show on desktop" and "show on mobile",
 * while the saved layout carries `hideOnDesktop` and `hideOnMobile`. It also has
 * to leave out widgets the server has switched off entirely, because offering a
 * terminal widget on an install with terminal access disabled produces a widget
 * that can never work.
 *
 * The control modal edits one widget's own settings, and does it on a copy -
 * dismissing has to leave the widget exactly as it was, which is easy to break
 * by editing the object the dashboard is holding.
 */
describe('the dashboard widget modals', () => {
  let api: FakeApi
  let settings: FakeSettings
  let activeModal: ReturnType<typeof activeModalStub>
  let ws: FakeWs
  let io: FakeIoNamespace
  let http: HttpTestingController
  let resetLayout: ReturnType<typeof vi.fn>

  /**
   * Build the visibility modal.
   * @param options - how to set it up
   * @param options.dashboard - the widgets currently on the dashboard
   * @param options.env - settings env overrides
   * @param options.featureFlags - the feature flags to enable
   */
  async function openVisibility(options: {
    dashboard?: any[]
    env?: Record<string, any>
    featureFlags?: Record<string, boolean>
  } = {}) {
    TestBed.resetTestingModule()
    settings = makeSettings({ env: { ...options.env, featureFlags: options.featureFlags ?? {} } })
    activeModal = activeModalStub()
    resetLayout = vi.fn()

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ settings, activeModal, toastr: toastrStub() }),
        {
          provide: WIDGET_VISIBILITY_MODAL_DATA,
          useValue: { dashboard: options.dashboard ?? [], resetLayout },
        },
      ],
    })

    const fixture = TestBed.createComponent(WidgetVisibilityComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    return fixture.componentInstance
  }

  /**
   * Build the control modal for one widget.
   * @param widget - the widget being configured
   * @param options - how to set it up
   * @param options.serverInfoFails - make the server info request error
   * @param options.interfaces - the bridge network interfaces to offer
   * @param options.lightMode - whether the app is in light mode
   */
  async function openControl(widget: Record<string, any>, options: {
    serverInfoFails?: boolean
    interfaces?: string[]
    lightMode?: boolean
  } = {}) {
    TestBed.resetTestingModule()
    api = fakeApi().respond('get', '/server/network-interfaces/bridge', options.interfaces ?? ['eth0', 'wlan0'])
    settings = makeSettings({ actualLightingMode: options.lightMode ? 'light' : 'dark' } as any)
    activeModal = activeModalStub()
    ws = fakeWs()
    io = ws.namespace('status')
    io.socket.respondTo('get-homebridge-server-info', options.serverInfoFails
      ? { error: 'offline' }
      : { nodeVersion: '22.0.0', homebridgeVersion: '2.0.0' })

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTestTranslate(),
        provideFakes({ api, settings, activeModal, ws, toastr: toastrStub() }),
        { provide: WIDGET_CONTROL_MODAL_DATA, useValue: { widget } },
      ],
    })

    http = TestBed.inject(HttpTestingController)

    const fixture = TestBed.createComponent(WidgetControlComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }

    return fixture.componentInstance
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('choosing which widgets exist', () => {
    it('offers every widget the install supports', async () => {
      const modal = await openVisibility()

      const components = modal.availableWidgets().map(entry => entry.component)
      expect(components).toContain('CpuWidgetComponent')
      expect(components).toContain('ClockWidgetComponent')
      expect(components).toContain('HapQrcodeWidgetComponent')
    })

    it('lists them in alphabetical order of their names', async () => {
      const modal = await openVisibility()

      // Translations return their own keys here, so this checks the sort is
      // applied rather than the English wording
      const names = modal.availableWidgets().map(entry => entry.name)
      expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names)
    })

    it('leaves out the accessories widget when accessory control is off', async () => {
      const modal = await openVisibility({ env: { enableAccessories: false } })

      // The widget would render an empty box with no way to fix it
      expect(modal.availableWidgets().map(entry => entry.component)).not.toContain('AccessoriesWidgetComponent')
    })

    it('leaves out the terminal widget when terminal access is off', async () => {
      const modal = await openVisibility({ env: { enableTerminalAccess: false } })

      expect(modal.availableWidgets().map(entry => entry.component)).not.toContain('TerminalWidgetComponent')
    })

    it('offers the matter pairing widget only when matter is supported', async () => {
      const without = await openVisibility()
      expect(without.availableWidgets().map(entry => entry.component)).not.toContain('MatterQrcodeWidgetComponent')

      const with_ = await openVisibility({ featureFlags: { matterSupport: true } })
      expect(with_.availableWidgets().map(entry => entry.component)).toContain('MatterQrcodeWidgetComponent')
    })

    it('treats a widget that is not on the dashboard as hidden everywhere', async () => {
      const modal = await openVisibility({ dashboard: [] })
      const cpu = modal.availableWidgets().find(entry => entry.component === 'CpuWidgetComponent')!

      expect(cpu.showOnDesktop).toBe(false)
      expect(cpu.showOnMobile).toBe(false)
    })

    it('treats a widget on the dashboard as shown unless it says otherwise', async () => {
      const modal = await openVisibility({ dashboard: [{ component: 'CpuWidgetComponent' }] })
      const cpu = modal.availableWidgets().find(entry => entry.component === 'CpuWidgetComponent')!

      // Older saved layouts have no hide flags at all, and those widgets are
      // visible on both
      expect(cpu.showOnDesktop).toBe(true)
      expect(cpu.showOnMobile).toBe(true)
    })

    it('reads a widget hidden on one screen size only', async () => {
      const modal = await openVisibility({
        dashboard: [{ component: 'CpuWidgetComponent', hideOnDesktop: true, hideOnMobile: false }],
      })
      const cpu = modal.availableWidgets().find(entry => entry.component === 'CpuWidgetComponent')!

      expect(cpu.showOnDesktop).toBe(false)
      expect(cpu.showOnMobile).toBe(true)
    })

    it('starts with nothing to save', async () => {
      const modal = await openVisibility({ dashboard: [{ component: 'CpuWidgetComponent' }] })

      expect(modal.isFormUnchanged()).toBe(true)
    })

    it('notices a checkbox being ticked', async () => {
      const modal = await openVisibility()
      const cpu = modal.availableWidgets().find(entry => entry.component === 'CpuWidgetComponent')!

      modal.toggleDesktop(cpu)

      expect(modal.isFormUnchanged()).toBe(false)
    })

    it('goes back to unchanged when the tick is undone', async () => {
      const modal = await openVisibility()
      const cpu = modal.availableWidgets().find(entry => entry.component === 'CpuWidgetComponent')!

      modal.toggleDesktop(cpu)
      modal.toggleDesktop(modal.availableWidgets().find(entry => entry.component === 'CpuWidgetComponent')!)

      expect(modal.isFormUnchanged()).toBe(true)
    })

    it('keeps the two screen sizes independent', async () => {
      const modal = await openVisibility({ dashboard: [{ component: 'CpuWidgetComponent' }] })
      const cpu = () => modal.availableWidgets().find(entry => entry.component === 'CpuWidgetComponent')!

      modal.toggleDesktop(cpu())

      // A user hiding a big widget on their phone must not lose it on the desktop
      expect(cpu().showOnDesktop).toBe(false)
      expect(cpu().showOnMobile).toBe(true)
    })

    it('keeps the two screen sizes independent from the mobile side too', async () => {
      // ⚠️ The mobile toggle is its own copy of the desktop one. Written against
      // the wrong flag it would hide the widget on the desktop instead, which is
      // the opposite of what the user asked for
      const modal = await openVisibility({ dashboard: [{ component: 'CpuWidgetComponent' }] })
      const cpu = () => modal.availableWidgets().find(entry => entry.component === 'CpuWidgetComponent')!

      modal.toggleMobile(cpu())

      expect(cpu().showOnMobile).toBe(false)
      expect(cpu().showOnDesktop).toBe(true)
    })

    it('notices a mobile checkbox being ticked', async () => {
      const modal = await openVisibility()
      const cpu = modal.availableWidgets().find(entry => entry.component === 'CpuWidgetComponent')!

      modal.toggleMobile(cpu)

      expect(modal.isFormUnchanged()).toBe(false)
    })

    it('leaves the other widgets alone when one is toggled', async () => {
      const modal = await openVisibility({
        dashboard: [{ component: 'CpuWidgetComponent' }, { component: 'MemoryWidgetComponent' }],
      })

      modal.toggleMobile(modal.availableWidgets().find(entry => entry.component === 'CpuWidgetComponent')!)

      const memory = modal.availableWidgets().find(entry => entry.component === 'MemoryWidgetComponent')!
      expect(memory.showOnMobile).toBe(true)
      expect(memory.showOnDesktop).toBe(true)
    })

    it('closes with the hide flags the layout actually stores', async () => {
      const modal = await openVisibility({ dashboard: [{ component: 'CpuWidgetComponent' }] })
      modal.toggleDesktop(modal.availableWidgets().find(entry => entry.component === 'CpuWidgetComponent')!)

      modal.saveModal()

      // The checkboxes are positives and the saved layout is negatives, so this
      // inversion is the one thing that has to be right
      const result = (activeModal.close as any).mock.calls[0][0]
      const cpu = result.find((entry: any) => entry.component === 'CpuWidgetComponent')
      expect(cpu.showOnDesktop).toBe(false)
      expect(cpu.hideOnDesktop).toBe(true)
      expect(cpu.hideOnMobile).toBe(false)
    })

    it('sends the size and order the widget should be created at', async () => {
      const modal = await openVisibility()

      modal.saveModal()

      // The caller needs these to place a newly enabled widget on the grid
      const result = (activeModal.close as any).mock.calls[0][0]
      const cpu = result.find((entry: any) => entry.component === 'CpuWidgetComponent')
      expect(cpu.cols).toBe(5)
      expect(cpu.rows).toBe(3)
      expect(cpu.mobileOrder).toBe(40)
    })

    it('marks the widgets that need configuring before they work', async () => {
      const modal = await openVisibility()

      // The weather widget needs a location picking, so the caller flags it
      const weather = modal.availableWidgets().find(entry => entry.component === 'WeatherWidgetComponent')!
      expect(weather.requiresConfig).toBe(true)
      expect(modal.availableWidgets().find(entry => entry.component === 'CpuWidgetComponent')!.requiresConfig).toBeUndefined()
    })

    it('resets the layout through the callback and gets out of the way', async () => {
      const modal = await openVisibility()

      modal.doResetLayout()

      // Dismissed rather than closed: the caller must not then apply this
      // modal's own entries on top of the freshly reset layout
      expect(resetLayout).toHaveBeenCalled()
      expect(activeModal.dismiss).toHaveBeenCalled()
      expect(activeModal.close).not.toHaveBeenCalled()
    })
  })

  describe('editing one widget', () => {
    it('reads the existing server info for the panel', async () => {
      const modal = await openControl({ component: 'SystemInfoWidgetComponent' })

      // `getExistingNamespace`, not a fresh connection: the status page behind
      // this modal already has the socket open
      expect(ws.getExistingNamespace).toHaveBeenCalledWith('status')
      expect(modal.serverInfo()).toMatchObject({ nodeVersion: '22.0.0' })
    })

    it('copes with the server info being unavailable', async () => {
      const modal = await openControl({ component: 'SystemInfoWidgetComponent' }, { serverInfoFails: true })

      expect(modal.serverInfo()).toBeNull()
    })

    it('offers the bridge network interfaces for the network widget', async () => {
      const modal = await openControl({ component: 'NetworkWidgetComponent' })

      expect(modal.networkInterfaces()).toEqual(['eth0', 'wlan0'])
    })

    it('does not ask for network interfaces for other widgets', async () => {
      const modal = await openControl({ component: 'CpuWidgetComponent' })

      // Only one widget can use them, and the lookup is a server round trip
      expect(api.callsTo('get', '/server/network-interfaces/bridge')).toHaveLength(0)
      expect(modal.networkInterfaces()).toEqual([])
    })

    it('knows whether the app is in light mode', async () => {
      expect((await openControl({ component: 'ClockWidgetComponent' }, { lightMode: true })).isLightMode()).toBe(true)
      expect((await openControl({ component: 'ClockWidgetComponent' })).isLightMode()).toBe(false)
    })

    it('starts with nothing to save', async () => {
      const modal = await openControl({ component: 'CpuWidgetComponent', refreshInterval: 10 })

      expect(modal.hasChanges).toBe(false)
    })

    it('notices each setting a widget can change', async () => {
      const cases: Array<[string, any]> = [
        ['showNpmVersion', true],
        ['dockerExpanded', true],
        ['timeFormat', 'H:mm'],
        ['dateFormat', 'EEEE'],
        ['refreshInterval', 30],
        ['historyItems', 50],
        ['networkInterface', 'wlan0'],
        ['showToolbar', true],
      ]

      const missed: string[] = []
      for (const [field, value] of cases) {
        const modal = await openControl({ component: 'CpuWidgetComponent' })
        ;(modal.widget as any)[field] = value
        if (!modal.hasChanges) {
          missed.push(field)
        }
      }

      // Collected rather than asserted per field, so a failure names every
      // setting the change check has forgotten about rather than just the first
      expect(missed).toEqual([])
    })

    it('notices the weather location changing', async () => {
      const modal = await openControl({ component: 'WeatherWidgetComponent', location: { id: 1, name: 'London' } })

      modal.widget.location = { id: 2, name: 'Paris' } as any

      // Compared by id, because the typeahead hands back a fresh object every
      // time even for the same city
      expect(modal.hasChanges).toBe(true)
    })

    it('does not count reselecting the same location as a change', async () => {
      const modal = await openControl({ component: 'WeatherWidgetComponent', location: { id: 1, name: 'London' } })

      modal.widget.location = { id: 1, name: 'London' } as any

      expect(modal.hasChanges).toBe(false)
    })

    it('leaves the widget alone when dismissed', async () => {
      const widget = { component: 'CpuWidgetComponent', refreshInterval: 10 }
      const modal = await openControl(widget)
      modal.widget.refreshInterval = 60

      modal.dismissModal()

      // The modal edits a copy for exactly this reason: cancelling has to leave
      // the running widget untouched
      expect(widget.refreshInterval).toBe(10)
      expect(activeModal.dismiss).toHaveBeenCalled()
    })

    it('writes the changes back onto the running widget when saved', async () => {
      const widget = { component: 'CpuWidgetComponent', refreshInterval: 10 }
      const modal = await openControl(widget)
      modal.widget.refreshInterval = 60

      modal.closeModal()

      // Assigned onto the original object rather than replacing it, because the
      // dashboard and gridster both hold that reference
      expect(widget.refreshInterval).toBe(60)
      expect(activeModal.close).toHaveBeenCalled()
    })
  })

  describe('searching for a weather location', () => {
    const owmUrl = 'https://api.openweathermap.org/data/2.5/find'

    // Matched by predicate rather than by string: the request carries its query
    // in HttpParams, and the string form of expectOne compares the whole url
    const isOwm = (request: { url: string }) => request.url.startsWith(owmUrl)

    beforeEach(() => {
      vi.useFakeTimers()
    })

    /**
     * Run a query through the typeahead and collect what it produced.
     * @param modal - the control modal
     * @param terms - the search terms to type
     */
    function search(modal: WidgetControlComponent, ...terms: string[]) {
      const input = new Subject<string>()
      const results: any[] = []
      modal.searchCountryCodes(input).subscribe(value => results.push(value))
      terms.forEach(term => input.next(term))
      return results
    }

    it('ignores a query too short to be a place name', async () => {
      const modal = await openControl({ component: 'WeatherWidgetComponent' })

      const results = search(modal, 'Lo')
      await vi.advanceTimersByTimeAsync(300)

      // Two letters would match half the world, and this is a third-party API
      // with a rate limit
      expect(results).toEqual([[]])
      http.expectNone(isOwm)
    })

    it('waits for the user to stop typing', async () => {
      const modal = await openControl({ component: 'WeatherWidgetComponent' })

      search(modal, 'Lon', 'Lond', 'London')
      await vi.advanceTimersByTimeAsync(300)

      expect(http.match(isOwm)).toHaveLength(1)
    })

    it('returns the cities with the fields the picker needs', async () => {
      const modal = await openControl({ component: 'WeatherWidgetComponent' })

      const results = search(modal, 'London')
      await vi.advanceTimersByTimeAsync(300)
      http.expectOne(isOwm).flush({
        list: [{ id: 2643743, name: 'London', sys: { country: 'GB' }, coord: { lat: 51.5, lon: -0.13 } }],
      })

      expect(results.at(-1)).toEqual([
        { id: 2643743, name: 'London', country: 'GB', coord: { lat: 51.5, lon: -0.13 } },
      ])
      expect(modal.searchCountryCodeFormatter({ name: 'London', country: 'GB' })).toBe('London, GB')
    })

    it('gives up quietly when the weather service cannot be reached', async () => {
      const modal = await openControl({ component: 'WeatherWidgetComponent' })

      const results = search(modal, 'London')
      await vi.advanceTimersByTimeAsync(300)
      http.expectOne(isOwm).flush('nope', { status: 500, statusText: 'Server Error' })

      // An error here must not kill the typeahead stream, or the box stops
      // working until the modal is reopened
      expect(results.at(-1)).toEqual([])
      expect(modal.searching()).toBe(false)
    })

    it('clears the searching flag after a result arrives', async () => {
      const modal = await openControl({ component: 'WeatherWidgetComponent' })

      search(modal, 'London')
      await vi.advanceTimersByTimeAsync(300)
      expect(modal.searching()).toBe(true)

      http.expectOne(isOwm).flush({ list: [] })

      expect(modal.searching()).toBe(false)
    })
  })
})
