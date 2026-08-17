import type { FakeIoNamespace, FakeSettings, FakeWs } from '@/testing'

import { DecimalPipe, TitleCasePipe, UpperCasePipe } from '@angular/common'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { NO_ERRORS_SCHEMA, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { DragulaService } from 'ng2-dragula'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { MobileDetectService } from '@/app/core/utilities/mobile-detect.service'
import { AccessoriesWidgetComponent } from '@/app/modules/status/widgets/accessories-widget/accessories-widget.component'
import { HapQrcodeWidgetComponent } from '@/app/modules/status/widgets/hap-qrcode-widget/hap-qrcode-widget.component'
import { MatterQrcodeWidgetComponent } from '@/app/modules/status/widgets/matter-qrcode-widget/matter-qrcode-widget.component'
import { WeatherWidgetComponent } from '@/app/modules/status/widgets/weather-widget/weather-widget.component'
import { fakeWs, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The remaining dashboard widgets: the two pairing QR codes, the weather, and the
 * accessories shortcut.
 *
 * The QR widgets are the two places a user actually pairs their home, so the
 * thing that matters is not showing a code that cannot work: a bridge with HAP
 * switched off, or in externals-only mode, has no bridge accessory to pair with,
 * and a QR code there would send the user round in circles in the Home app.
 *
 * The weather widget is the only thing in the app that calls a third-party API,
 * so it caches for twenty minutes and shows the cached reading rather than a
 * spinner.
 */
describe('the pairing and content widgets', () => {
  let settings: FakeSettings
  let ws: FakeWs
  let io: FakeIoNamespace
  let http: HttpTestingController
  let resizeEvent: Subject<void>
  let configureEvent: Subject<void>
  let accessories: Record<string, any>
  let accessoryData: Subject<any>
  let layoutSaved: Subject<any>
  let dragula: Record<string, ReturnType<typeof vi.fn>>
  let dropEvents: Subject<any>
  let saveWidgetsEvent: Subject<any>
  let isMobile: boolean

  /**
   * Build a widget.
   * @param type - the widget component
   * @param widget - the widget config
   * @param options - how to set it up
   * @param options.connected - whether the status socket starts connected
   * @param options.pairing - what the pairing request answers with
   * @param options.rooms - the accessory rooms the service reports
   * @param options.env - settings env overrides
   * @param options.awaitStable - whether to wait for stability before returning
   */
  async function open<T>(type: new (...args: any[]) => T, widget: any, options: {
    connected?: boolean
    pairing?: Record<string, any>
    rooms?: any[]
    env?: Record<string, any>
    awaitStable?: boolean
  } = {}) {
    TestBed.resetTestingModule()
    settings = makeSettings({ env: options.env })
    ws = fakeWs()
    io = ws.namespace('status', { connected: options.connected ?? true })
    resizeEvent = new Subject()
    configureEvent = new Subject()
    accessoryData = new Subject()
    layoutSaved = new Subject()
    dropEvents = new Subject()
    saveWidgetsEvent = new Subject()

    io.socket.respondTo('get-homebridge-pairing-pin', options.pairing ?? {
      pin: '031-45-154',
      paired: false,
      setupUri: 'X-HM://0024K0RR0TEST',
    })

    accessories = {
      rooms: signal(options.rooms ?? []),
      accessoryData,
      layoutSaved,
      start: vi.fn(async () => undefined),
      stop: vi.fn(),
    }
    dragula = { createGroup: vi.fn(), destroy: vi.fn(), drop: vi.fn(() => dropEvents) }

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTestTranslate(),
        provideFakes({ settings, ws, toastr: toastrStub() }),
        { provide: AccessoriesService, useValue: accessories },
        { provide: DragulaService, useValue: dragula },
        { provide: MobileDetectService, useValue: { detect: { mobile: () => isMobile } } },
      ],
    })

    // The QR code component draws an svg from a third-party library, and the
    // accessory tiles have their own routing spec
    TestBed.overrideComponent(type as any, {
      set: {
        imports: [TranslatePipe, ConvertTempPipe, DecimalPipe, TitleCasePipe, UpperCasePipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    })

    http = TestBed.inject(HttpTestingController)

    const fixture = TestBed.createComponent(type as any)
    // Mutated rather than spread into a copy: the accessories widget writes the
    // drag order back onto the object the dashboard is holding
    widget.$saveWidgetsEvent ??= saveWidgetsEvent
    fixture.componentRef.setInput('widget', widget)
    const instance = fixture.componentInstance as any
    instance.resizeEvent = resizeEvent
    instance.configureEvent = configureEvent

    fixture.detectChanges()

    // `httpResource` issues its request during change detection, and a pending
    // resource keeps the fixture unstable - so a widget whose request this spec
    // has to flush by hand cannot be awaited here or the two deadlock
    if (options.awaitStable ?? true) {
      await fixture.whenStable()
    }

    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }

    return { fixture, widget: instance as T }
  }

  /** Let the pending frame callbacks run. */
  function flushFrames(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  beforeEach(() => {
    isMobile = false
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the hap pairing code', () => {
    it('shows the pin and the setup code', async () => {
      const { widget } = await open(HapQrcodeWidgetComponent, { component: 'HapQrcodeWidgetComponent' })
      await flushFrames()

      expect(widget.pin()).toBe('031-45-154')
      expect(widget.setupUri()).toBe('X-HM://0024K0RR0TEST')
      expect(widget.loading()).toBe(false)
      expect(widget.enabled()).toBe(true)
    })

    it('treats a status with no hap block as hap being on', async () => {
      const { widget } = await open(HapQrcodeWidgetComponent, { component: 'HapQrcodeWidgetComponent' }, {
        pairing: { pin: '031-45-154', paired: false },
      })

      // Older Homebridge versions do not send the flag at all, and they always
      // publish the bridge
      expect(widget.enabled()).toBe(true)
    })

    it('hides the code when hap is switched off', async () => {
      const { widget } = await open(HapQrcodeWidgetComponent, { component: 'HapQrcodeWidgetComponent' }, {
        pairing: { pin: '031-45-154', paired: true, setupUri: 'X-HM://X', hap: { enabled: false } },
      })

      // There is no bridge accessory to pair with, so a code here would simply
      // never work
      expect(widget.enabled()).toBe(false)
      expect(widget.pin()).toBe('')
      expect(widget.setupUri()).toBeNull()
      expect(widget.paired()).toBe(false)
    })

    it('hides the code in externals-only mode', async () => {
      const { widget } = await open(HapQrcodeWidgetComponent, { component: 'HapQrcodeWidgetComponent' }, {
        pairing: { pin: '031-45-154', paired: false, setupUri: 'X-HM://X', hap: { enabled: true, externalsOnly: true } },
      })

      // HAP is on and plugins still publish their own accessories, but the
      // bridge itself is not advertised
      expect(widget.externalsOnly()).toBe(true)
      expect(widget.pin()).toBe('')
      expect(widget.setupUri()).toBeNull()
    })

    it('says it is paired once the home app has it', async () => {
      const { widget } = await open(HapQrcodeWidgetComponent, { component: 'HapQrcodeWidgetComponent' }, {
        pairing: { pin: '031-45-154', paired: true, setupUri: 'X-HM://X' },
      })

      expect(widget.paired()).toBe(true)
    })

    it('follows the live status when it changes', async () => {
      const { widget } = await open(HapQrcodeWidgetComponent, { component: 'HapQrcodeWidgetComponent' })

      io.socket.fire('homebridge-status', { pin: '031-45-154', paired: true, hap: { enabled: true } })
      await flushFrames()

      // Pairing in the Home app changes this while the page is open
      expect(widget.paired()).toBe(true)
    })

    it('asks for nothing until the socket connects', async () => {
      const { widget } = await open(HapQrcodeWidgetComponent, { component: 'HapQrcodeWidgetComponent' }, {
        connected: false,
      })

      expect(io.requests).toHaveLength(0)
      expect(widget.loading()).toBe(true)
    })

    it('detaches its status listener when removed', async () => {
      await open(HapQrcodeWidgetComponent, { component: 'HapQrcodeWidgetComponent' })
      expect(io.socket.handlers('homebridge-status')).toHaveLength(1)

      TestBed.resetTestingModule()

      // The status namespace is shared, so a widget switched off on the dashboard
      // must stop listening
      expect(io.socket.handlers('homebridge-status')).toHaveLength(0)
    })
  })

  describe('the matter pairing code', () => {
    it('stays off when the status has no matter block', async () => {
      const { widget } = await open(MatterQrcodeWidgetComponent, { component: 'MatterQrcodeWidgetComponent' })

      // Unlike HAP, Matter is off unless the server says otherwise
      expect(widget.enabled()).toBe(false)
      expect(widget.pin()).toBe('')
      expect(widget.loading()).toBe(false)
    })

    it('shows the code when matter is enabled', async () => {
      const { widget } = await open(MatterQrcodeWidgetComponent, { component: 'MatterQrcodeWidgetComponent' }, {
        pairing: { matter: { enabled: true, pin: '1234-567-8901', setupUri: 'MT:TEST', commissioned: false } },
      })

      expect(widget.enabled()).toBe(true)
      expect(widget.pin()).toBe('1234-567-8901')
      expect(widget.setupUri()).toBe('MT:TEST')
    })

    it('says it is commissioned once a controller has it', async () => {
      const { widget } = await open(MatterQrcodeWidgetComponent, { component: 'MatterQrcodeWidgetComponent' }, {
        pairing: { matter: { enabled: true, pin: '1234-567-8901', commissioned: true } },
      })

      expect(widget.commissioned()).toBe(true)
    })

    it('keeps the last pin when an update omits it', async () => {
      const { widget } = await open(MatterQrcodeWidgetComponent, { component: 'MatterQrcodeWidgetComponent' }, {
        pairing: { matter: { enabled: true, pin: '1234-567-8901' } },
      })

      io.socket.fire('homebridge-status', { matter: { enabled: true, commissioned: true } })
      await flushFrames()

      // The pin does not change while the fabric exists, and blanking it would
      // make the widget look broken mid-commissioning
      expect(widget.pin()).toBe('1234-567-8901')
      expect(widget.commissioned()).toBe(true)
    })

    it('clears the code when matter is turned off', async () => {
      const { widget } = await open(MatterQrcodeWidgetComponent, { component: 'MatterQrcodeWidgetComponent' }, {
        pairing: { matter: { enabled: true, pin: '1234-567-8901', setupUri: 'MT:TEST', commissioned: true } },
      })

      io.socket.fire('homebridge-status', { matter: { enabled: false } })
      await flushFrames()

      expect(widget.setupUri()).toBeNull()
      expect(widget.commissioned()).toBe(false)
    })

    it('detaches its status listener when removed', async () => {
      await open(MatterQrcodeWidgetComponent, { component: 'MatterQrcodeWidgetComponent' })

      TestBed.resetTestingModule()

      expect(io.socket.handlers('homebridge-status')).toHaveLength(0)
    })
  })

  describe('the weather widget', () => {
    const owmUrl = 'https://api.openweathermap.org/data/2.5/weather'
    const isOwm = (request: { url: string }) => request.url.startsWith(owmUrl)

    /**
     * Build the weather widget without waiting for stability.
     *
     * Its request is issued during change detection and flushed by hand here, so
     * waiting for the fixture to settle first would deadlock against the flush.
     * @param widget - the widget config
     * @param options - how to set it up
     * @param options.env - settings env overrides
     */
    function openWeather(widget: any, options: { env?: Record<string, any> } = {}) {
      return open(WeatherWidgetComponent, widget, { ...options, awaitStable: false })
    }

    /**
     * A weather reading as OpenWeatherMap returns it.
     * @param icon - the icon code
     * @param temp - the temperature in celsius
     */
    function makeReading(icon = '01d', temp = 18) {
      return { weather: [{ icon, description: 'clear sky' }], main: { temp }, name: 'London' }
    }

    it('asks for nothing until a location is chosen', async () => {
      await openWeather({ component: 'WeatherWidgetComponent' })

      // The widget is added before it is configured, and a request with no id
      // would just waste an API call
      expect(http.match(isOwm)).toHaveLength(0)
    })

    it('fetches the weather for the configured location', async () => {
      const { widget } = await openWeather({
        component: 'WeatherWidgetComponent',
        location: { id: 2643743, name: 'London' },
      })

      http.expectOne(isOwm).flush(makeReading())
      await Promise.resolve()

      expect(widget.currentWeather()).toMatchObject({ name: 'London' })
    })

    it('remembers the reading for next time', async () => {
      const { fixture } = await openWeather({
        component: 'WeatherWidgetComponent',
        location: { id: 2643743, name: 'London' },
      })

      http.expectOne(isOwm).flush(makeReading())
      // The write happens in an effect, which only runs on a change detection
      // pass - awaiting a microtask is not enough
      await fixture.whenStable()

      // Stamped with the time it arrived, which is what the freshness check reads
      const stored = JSON.parse(window.localStorage.getItem('weather-2643743')!)
      expect(stored.name).toBe('London')
      expect(stored.timestamp).toBeTruthy()
    })

    it('shows a recent reading without asking again', async () => {
      window.localStorage.setItem('weather-2643743', JSON.stringify({
        ...makeReading('10d', 12),
        timestamp: new Date().toISOString(),
      }))

      const { widget } = await openWeather({
        component: 'WeatherWidgetComponent',
        location: { id: 2643743, name: 'London' },
      })

      // OpenWeatherMap rate-limits the free tier, and several browser tabs each
      // reloading would burn through it
      expect(http.match(isOwm)).toHaveLength(0)
      expect(widget.currentWeather()).toMatchObject({ main: { temp: 12 } })
    })

    it('asks again once the cached reading is stale', async () => {
      window.localStorage.setItem('weather-2643743', JSON.stringify({
        ...makeReading(),
        timestamp: new Date(Date.now() - 21 * 60 * 1000).toISOString(),
      }))

      await openWeather({
        component: 'WeatherWidgetComponent',
        location: { id: 2643743, name: 'London' },
      })

      // Twenty minutes is the cache window, so this one is past it
      expect(http.match(isOwm)).toHaveLength(1)
    })

    it('ignores a cached entry with no timestamp', async () => {
      window.localStorage.setItem('weather-2643743', JSON.stringify(makeReading()))

      await openWeather({
        component: 'WeatherWidgetComponent',
        location: { id: 2643743, name: 'London' },
      })

      expect(http.match(isOwm)).toHaveLength(1)
    })

    it('survives unreadable cached data', async () => {
      window.localStorage.setItem('weather-2643743', 'not json at all')

      await openWeather({
        component: 'WeatherWidgetComponent',
        location: { id: 2643743, name: 'London' },
      })

      // A widget that throws here would take the whole dashboard down with it
      expect(http.match(isOwm)).toHaveLength(1)
    })

    it('caches per location, not globally', async () => {
      window.localStorage.setItem('weather-2643743', JSON.stringify({
        ...makeReading(),
        timestamp: new Date().toISOString(),
      }))

      await openWeather({
        component: 'WeatherWidgetComponent',
        location: { id: 2988507, name: 'Paris' },
      })

      // Two weather widgets for different cities are a normal setup
      expect(http.match(isOwm)).toHaveLength(1)
    })

    it('translates the icon codes into icons', async () => {
      const { widget } = await openWeather({
        component: 'WeatherWidgetComponent',
        location: { id: 2643743, name: 'London' },
      })
      http.expectOne(isOwm).flush(makeReading('01n'))
      await Promise.resolve()

      // The night variants matter: a sun icon at midnight looks like a bug
      expect(widget.getWeatherIconClass()).toBe('far fa-moon')
    })

    it('falls back to a plain cloud for an unknown code', async () => {
      const { widget } = await openWeather({
        component: 'WeatherWidgetComponent',
        location: { id: 2643743, name: 'London' },
      })
      http.expectOne(isOwm).flush(makeReading('99z'))
      await Promise.resolve()

      expect(widget.getWeatherIconClass()).toBe('fas fa-cloud')
    })

    /**
     * Every icon code OpenWeatherMap sends, and the Font Awesome icon it becomes.
     *
     * ⚠️ The day and night variants are the point: a sun icon at midnight reads as
     * a bug, and several codes deliberately share one icon (broken and scattered
     * cloud both show the same thing), so the pairs cannot be derived — they have
     * to be listed.
     */
    it.each([
      ['01d', 'far fa-sun'],
      ['01n', 'far fa-moon'],
      ['02d', 'fas fa-cloud-sun'],
      ['02n', 'fas fa-cloud-moon'],
      ['03d', 'fas fa-cloud-sun'],
      ['03n', 'fas fa-cloud-moon'],
      ['04d', 'fas fa-cloud-sun'],
      ['04n', 'fas fa-cloud-moon'],
      ['09d', 'fas fa-cloud-sun-rain'],
      ['09n', 'fas fa-cloud-moon-rain'],
      ['10d', 'fas fa-cloud-rain'],
      ['10n', 'fas fa-cloud-moon-rain'],
      ['11d', 'fas fa-cloud-showers-heavy'],
      ['11n', 'fas fa-cloud-showers-heavy'],
      ['13d', 'fas fa-snowflake'],
      ['13n', 'fas fa-snowflake'],
      ['50d', 'fas fa-smog'],
      ['50n', 'fas fa-smog'],
    ])('shows %s as %s', async (icon, expected) => {
      const { widget } = await openWeather({
        component: 'WeatherWidgetComponent',
        location: { id: 2643743, name: 'London' },
      })
      http.expectOne(isOwm).flush(makeReading(icon))
      await Promise.resolve()

      expect(widget.getWeatherIconClass()).toBe(expected)
    })

    it('shows a cloud when there is no reading at all', async () => {
      const { widget } = await openWeather({ component: 'WeatherWidgetComponent' })

      expect(widget.getWeatherIconClass()).toBe('fas fa-cloud')
    })

    it('reads the temperature units from the settings', async () => {
      const { widget } = await openWeather({ component: 'WeatherWidgetComponent' }, {
        env: { temperatureUnits: 'f' },
      })

      expect(widget.temperatureUnits).toBe('f')
    })
  })

  describe('the accessories widget', () => {
    /**
     * A room holding accessories.
     * @param services - the accessories in it
     */
    function makeRoom(services: any[]) {
      return { name: 'Default Room', isDefault: true, services }
    }

    /**
     * An accessory as the accessories service reports it.
     * @param uniqueId - its id
     * @param onDashboard - whether the user pinned it to the dashboard
     */
    function makeAccessory(uniqueId: string, onDashboard = true) {
      return { uniqueId, onDashboard, serviceName: uniqueId, type: 'Switch' }
    }

    it('shows only the accessories pinned to the dashboard', async () => {
      const { widget } = await open(AccessoriesWidgetComponent, { component: 'AccessoriesWidgetComponent' }, {
        rooms: [makeRoom([makeAccessory('a'), makeAccessory('b', false), makeAccessory('c')])],
      })

      accessoryData.next([])
      await Promise.resolve()

      expect(widget.dashboardAccessories().map(item => item.uniqueId)).toEqual(['a', 'c'])
      expect(widget.loaded()).toBe(true)
    })

    it('gathers them from every room', async () => {
      const { widget } = await open(AccessoriesWidgetComponent, { component: 'AccessoriesWidgetComponent' }, {
        rooms: [makeRoom([makeAccessory('a')]), { name: 'Kitchen', services: [makeAccessory('b')] }],
      })

      accessoryData.next([])
      await Promise.resolve()

      // The widget is a flat list; the rooms are a page concept
      expect(widget.dashboardAccessories().map(item => item.uniqueId)).toEqual(['a', 'b'])
    })

    it('honours the order the user dragged them into', async () => {
      const { widget } = await open(AccessoriesWidgetComponent, {
        component: 'AccessoriesWidgetComponent',
        accessoryOrder: ['c', 'a', 'b'],
      }, {
        rooms: [makeRoom([makeAccessory('a'), makeAccessory('b'), makeAccessory('c')])],
      })

      accessoryData.next([])
      await Promise.resolve()

      expect(widget.dashboardAccessories().map(item => item.uniqueId)).toEqual(['c', 'a', 'b'])
    })

    it('re-reads the list when the layout is saved elsewhere', async () => {
      const { widget } = await open(AccessoriesWidgetComponent, { component: 'AccessoriesWidgetComponent' }, {
        rooms: [makeRoom([makeAccessory('a')])],
      })

      layoutSaved.next(undefined)
      await Promise.resolve()

      // Pinning an accessory on the accessories page has to show up here
      expect(widget.dashboardAccessories()).toHaveLength(1)
    })

    it('saves the new order after a drag', async () => {
      // The subject goes on the config rather than being taken from the helper:
      // `open` builds a fresh one, so a subscription made before it would be
      // listening to the wrong subject
      const ownSaveEvent = new Subject<any>()
      const widgetConfig: any = { component: 'AccessoriesWidgetComponent', $saveWidgetsEvent: ownSaveEvent }
      const saved = vi.fn()
      ownSaveEvent.subscribe(saved)
      await open(AccessoriesWidgetComponent, widgetConfig, {
        rooms: [makeRoom([makeAccessory('a'), makeAccessory('b')])],
      })
      accessoryData.next([])
      await Promise.resolve()

      dropEvents.next({})

      // The order lives on the widget config, which the dashboard persists
      expect(widgetConfig.accessoryOrder).toEqual(['a', 'b'])
      expect(saved).toHaveBeenCalled()
    })

    it('does not allow dragging on a phone', async () => {
      isMobile = true
      const { widget } = await open(AccessoriesWidgetComponent, { component: 'AccessoriesWidgetComponent' })
      const group = dragula.createGroup.mock.calls[0][1]

      // A drag gesture on a touch screen is indistinguishable from a scroll
      expect(widget.isMobile()).toBe(true)
      expect(group.moves(document.createElement('div'))).toBe(false)
    })

    it('allows dragging on a desktop', async () => {
      await open(AccessoriesWidgetComponent, { component: 'AccessoriesWidgetComponent' })
      const group = dragula.createGroup.mock.calls[0][1]

      expect(group.moves(document.createElement('div'))).toBe(true)
    })

    it('refuses to drag a tile marked no-drag', async () => {
      await open(AccessoriesWidgetComponent, { component: 'AccessoriesWidgetComponent' })
      const group = dragula.createGroup.mock.calls[0][1]
      const tile = document.createElement('div')
      tile.classList.add('no-drag')

      expect(group.moves(tile)).toBe(false)
    })

    it('stops the feed and its drag group when removed', async () => {
      await open(AccessoriesWidgetComponent, { component: 'AccessoriesWidgetComponent' })

      TestBed.resetTestingModule()

      expect(accessories.stop).toHaveBeenCalled()
      expect(dragula.destroy).toHaveBeenCalledWith('widget-accessories-bag')
    })
  })
})
