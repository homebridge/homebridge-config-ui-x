import type { FakeIoNamespace, FakeSettings, FakeWs } from '@/testing'

import { DatePipe, DecimalPipe, TitleCasePipe, UpperCasePipe } from '@angular/common'
import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { ClockWidgetComponent } from '@/app/modules/status/widgets/clock-widget/clock-widget.component'
import { CpuWidgetComponent } from '@/app/modules/status/widgets/cpu-widget/cpu-widget.component'
import { MemoryWidgetComponent } from '@/app/modules/status/widgets/memory-widget/memory-widget.component'
import { NetworkWidgetComponent } from '@/app/modules/status/widgets/network-widget/network-widget.component'
import { SystemInfoWidgetComponent } from '@/app/modules/status/widgets/system-info-widget/system-info-widget.component'
import { fakeWs, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The small dashboard widgets: cpu, memory, network, clock and system info.
 *
 * The three chart widgets share a base class that keeps a fixed-length series of
 * points, and the rule that matters there is the length: the series has to make
 * room *before* appending, or it grows past the configured history size and the
 * chart squeezes more and more points into the same box.
 *
 * The other thing worth pinning is what these show before their first reading
 * arrives. Every metric signal starts as `undefined` rather than `0`, because a
 * widget that confidently reads "0%" for a few seconds after every page load
 * looks like a broken server rather than one that has not answered yet.
 */
describe('the metric widgets', () => {
  let settings: FakeSettings
  let ws: FakeWs
  let io: FakeIoNamespace
  let configureEvent: Subject<void>
  let resizeEvent: Subject<void>
  let chartUpdate: ReturnType<typeof vi.fn>

  /**
   * A widget config as the dashboard holds it.
   * @param overrides - fields to change
   */
  function makeWidget(overrides: Record<string, any> = {}): any {
    return { component: 'CpuWidgetComponent', ...overrides }
  }

  /**
   * Build a widget.
   *
   * The chart widgets are handed their event streams by the dashboard rather than
   * injecting them, so those are attached before the first change detection.
   * @param type - the widget component
   * @param widget - the widget config
   * @param options - how to set it up
   * @param options.env - settings env overrides
   * @param options.connected - whether the status socket starts connected
   * @param options.arrange - registers socket responses before creation
   */
  async function open<T>(type: new (...args: any[]) => T, widget: any = makeWidget(), options: {
    env?: Record<string, any>
    connected?: boolean
    arrange?: () => void
  } = {}) {
    TestBed.resetTestingModule()
    settings = makeSettings({ env: options.env })
    ws = fakeWs()
    io = ws.namespace('status', { connected: options.connected ?? true })
    configureEvent = new Subject()
    resizeEvent = new Subject()

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ settings, ws, toastr: toastrStub() }),
      ],
    })

    // Only the chart directive is dropped - jsdom has no canvas to draw on -
    // while every pipe the templates format their numbers with is kept
    TestBed.overrideComponent(type as any, {
      set: {
        imports: [TranslatePipe, ConvertTempPipe, DatePipe, DecimalPipe, UpperCasePipe, TitleCasePipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    })

    // Harmless defaults for every resource these widgets poll, registered
    // before `arrange` so a test can still override them.
    //
    // ⚠️ Without them a poll that fires between tests - the interval survives
    // long enough on a fake clock - is answered with `undefined`, and the
    // widget throws reading a field off it. That surfaces as an unhandled
    // error outside any test rather than as a failure, so the suite reports
    // green while warning that results may be unreliable.
    io.socket.respondTo('get-server-cpu-info', { cpuTemperature: {}, currentLoad: 0, cpuLoadHistory: [] })
    io.socket.respondTo('get-server-memory-info', { mem: { active: 0, total: 1 }, memoryUsageHistory: [] })
    io.socket.respondTo('get-server-network-info', { net: { rx_sec: 0, tx_sec: 0, interval: 1 }, networkUsageHistory: [] })

    options.arrange?.()

    const fixture = TestBed.createComponent(type as any)
    fixture.componentRef.setInput('widget', widget)
    const instance = fixture.componentInstance as any
    instance.configureEvent = configureEvent
    instance.resizeEvent = resizeEvent
    // The chart directive was dropped above, so the view child is empty. The cpu
    // and memory widgets call it optionally; the network one does not, so it
    // needs something to call `update()` on
    chartUpdate = vi.fn()
    instance.chart = () => ({ update: chartUpdate })

    fixture.detectChanges()
    await fixture.whenStable()

    return { fixture, widget: instance as T }
  }

  /**
   * The chart series as a plain array of values.
   * @param instance - the chart widget
   */
  function series(instance: any): number[] {
    const data = instance.lineChartData.datasets[0].data
    return Object.keys(data).map(key => data[key])
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('before the first reading arrives', () => {
    it('shows the cpu load as unknown rather than zero', async () => {
      const { widget } = await open(CpuWidgetComponent, makeWidget(), { connected: false })

      // `0` would render as a confident "0%" on a server that simply has not
      // answered yet
      expect(widget.currentLoad()).toBeUndefined()
    })

    it('shows the memory as unknown rather than zero', async () => {
      const { widget } = await open(MemoryWidgetComponent, makeWidget(), { connected: false })

      expect(widget.totalMemory()).toBeUndefined()
      expect(widget.freeMemory()).toBeUndefined()
    })

    it('shows the network rates as unknown rather than zero', async () => {
      const { widget } = await open(NetworkWidgetComponent, makeWidget(), { connected: false })

      expect(widget.receivedPerSec()).toBeUndefined()
      expect(widget.sentPerSec()).toBeUndefined()
    })
  })

  describe('the cpu widget', () => {
    it('asks for the cpu info once connected', async () => {
      const { widget } = await open(CpuWidgetComponent, makeWidget(), {
        arrange: () => io.socket.respondTo('get-server-cpu-info', {
          cpuTemperature: { main: 45 },
          currentLoad: 12.5,
          cpuLoadHistory: [10, 11, 12],
        }),
      })

      expect(widget.currentLoad()).toBe(12.5)
      expect(widget.cpuTemperature()).toEqual({ main: 45 })
    })

    it('seeds the chart from the history the server sends', async () => {
      const { widget } = await open(CpuWidgetComponent, makeWidget(), {
        arrange: () => io.socket.respondTo('get-server-cpu-info', {
          cpuTemperature: {},
          currentLoad: 13,
          cpuLoadHistory: [10, 11, 12],
        }),
      })

      // The first reading fills the chart in one go, so the widget is not blank
      // for the first minute
      expect(series(widget)).toEqual([10, 11, 12])
    })

    it('asks for nothing when metrics monitoring is switched off', async () => {
      const { widget } = await open(CpuWidgetComponent, makeWidget(), {
        env: { disableServerMetricsMonitoring: true },
      })

      // Collecting these is expensive on a small Pi, so it can be turned off
      // entirely on the server
      expect(widget.metricsDisabled).toBe(true)
      expect(io.requests).toHaveLength(0)
    })

    it('reads the temperature units from the settings', async () => {
      const { widget } = await open(CpuWidgetComponent, makeWidget(), { env: { temperatureUnits: 'f' } })

      expect(widget.temperatureUnits).toBe('f')
    })
  })

  describe('the chart series', () => {
    /**
     * Build a cpu widget whose chart already holds a full series.
     * @param historyItems - the configured history length
     * @param history - the initial history from the server
     */
    async function openWithHistory(historyItems: number, history: number[]) {
      const result = await open(CpuWidgetComponent, makeWidget({ historyItems }), {
        arrange: () => io.socket.respondTo('get-server-cpu-info', {
          cpuTemperature: {},
          currentLoad: history.at(-1),
          cpuLoadHistory: history,
        }),
      })
      return result.widget as any
    }

    it('appends a new reading to a series with room in it', async () => {
      const widget = await openWithHistory(5, [1, 2])

      widget.updateData({ cpuTemperature: {}, currentLoad: 3, cpuLoadHistory: [] })

      expect(series(widget)).toEqual([1, 2, 3])
    })

    it('never grows past the configured history length', async () => {
      const widget = await openWithHistory(3, [1, 2, 3])

      widget.updateData({ cpuTemperature: {}, currentLoad: 4, cpuLoadHistory: [] })

      // Room is made before appending. Appending first and trimming after left
      // one extra point on every tick, so the chart slowly crushed itself
      expect(series(widget)).toEqual([2, 3, 4])
      expect(series(widget)).toHaveLength(3)
    })

    it('stays at the limit over many readings', async () => {
      const widget = await openWithHistory(3, [1, 2, 3])

      for (const value of [4, 5, 6, 7, 8]) {
        widget.updateData({ cpuTemperature: {}, currentLoad: value, cpuLoadHistory: [] })
      }

      expect(series(widget)).toEqual([6, 7, 8])
      expect(widget.lineChartLabels).toHaveLength(3)
    })

    it('trims a history longer than the configured length', async () => {
      const widget = await openWithHistory(3, [1, 2, 3, 4, 5])

      // The server keeps its own history, which may be longer than this widget
      // has been asked to show
      expect(series(widget)).toEqual([3, 4, 5])
    })

    it('defaults the refresh interval and history length', async () => {
      const widget = await openWithHistory(0, [1])

      expect((widget as any).refreshInterval).toBe(10)
      expect((widget as any).historyItems).toBe(60)
    })

    it('clamps a refresh interval outside the allowed range', async () => {
      const fast = await open(CpuWidgetComponent, makeWidget({ refreshInterval: 0.1, historyItems: 500 }))
      expect((fast.widget as any).refreshInterval).toBe(1)
      expect((fast.widget as any).historyItems).toBe(60)

      const slow = await open(CpuWidgetComponent, makeWidget({ refreshInterval: 9000 }))
      // A widget polling every millisecond would hammer the server
      expect((slow.widget as any).refreshInterval).toBe(60)
    })

    it('polls on the interval it was given', async () => {
      vi.useFakeTimers()
      const { widget } = await open(CpuWidgetComponent, makeWidget({ refreshInterval: 5 }), {
        arrange: () => io.socket.respondTo('get-server-cpu-info', {
          cpuTemperature: {},
          currentLoad: 1,
          cpuLoadHistory: [1],
        }),
      })
      void widget
      const before = io.requests.length

      await vi.advanceTimersByTimeAsync(5000)

      expect(io.requests.length).toBe(before + 1)
    })

    it('stops polling while the socket is down', async () => {
      vi.useFakeTimers()
      await open(CpuWidgetComponent, makeWidget({ refreshInterval: 5 }), {
        arrange: () => io.socket.respondTo('get-server-cpu-info', {
          cpuTemperature: {},
          currentLoad: 1,
          cpuLoadHistory: [1],
        }),
      })
      io.socket.disconnect()
      const before = io.requests.length

      await vi.advanceTimersByTimeAsync(15000)

      // Requests against a dead socket would never be answered anyway
      expect(io.requests.length).toBe(before)
    })

    it('starts over when its settings change', async () => {
      const widget = await openWithHistory(5, [1, 2, 3])
      expect(series(widget)).toEqual([1, 2, 3])

      io.socket.respondTo('get-server-cpu-info', { cpuTemperature: {}, currentLoad: 9, cpuLoadHistory: [9] })
      configureEvent.next()

      // The old points were sampled at the old interval, so keeping them would
      // draw a chart whose x-axis means two different things
      expect(series(widget)).toEqual([9])
    })
  })

  describe('the memory widget', () => {
    it('reports the memory in gigabytes', async () => {
      const gb = 1024 * 1024 * 1024
      const { widget } = await open(MemoryWidgetComponent, makeWidget(), {
        arrange: () => io.socket.respondTo('get-server-memory-info', {
          mem: { total: 8 * gb, available: 2 * gb },
          memoryUsageHistory: [70, 75],
        }),
      })

      expect(widget.totalMemory()).toBe(8)
      expect(widget.freeMemory()).toBe(2)
    })

    it('ignores a reading with no memory in it', async () => {
      const { widget } = await open(MemoryWidgetComponent, makeWidget(), {
        arrange: () => io.socket.respondTo('get-server-memory-info', { memoryUsageHistory: [70] }),
      })

      // Rather than dividing undefined and rendering NaN GB
      expect(widget.totalMemory()).toBeUndefined()
    })

    it('charts the usage history, not the free memory', async () => {
      const gb = 1024 * 1024 * 1024
      const { widget } = await open(MemoryWidgetComponent, makeWidget(), {
        arrange: () => io.socket.respondTo('get-server-memory-info', {
          mem: { total: 8 * gb, available: 2 * gb },
          memoryUsageHistory: [70, 75, 80],
        }),
      })

      expect(series(widget)).toEqual([70, 75, 80])
    })
  })

  describe('the network widget', () => {
    const netResponse = {
      net: { iface: 'eth0', rx_sec: 1024 * 1024, tx_sec: 2 * 1024 * 1024 },
      point: 8,
    }

    it('asks about the interface the widget is configured for', async () => {
      await open(NetworkWidgetComponent, makeWidget({ networkInterface: 'wlan0' }), {
        arrange: () => io.socket.respondTo('get-server-network-info', netResponse),
      })

      expect(io.requests[0]).toEqual({
        resource: 'get-server-network-info',
        payload: { netInterfaces: ['wlan0'] },
      })
    })

    it('reports the rates in megabits per second', async () => {
      const { widget } = await open(NetworkWidgetComponent, makeWidget(), {
        arrange: () => io.socket.respondTo('get-server-network-info', netResponse),
      })

      // The server reports bytes per second; the widget shows bits
      expect(widget.receivedPerSec()).toBe(8)
      expect(widget.sentPerSec()).toBe(16)
    })

    it('remembers the interface the server chose', async () => {
      const widget = makeWidget()
      const { widget: instance } = await open(NetworkWidgetComponent, widget, {
        arrange: () => io.socket.respondTo('get-server-network-info', netResponse),
      })

      // Asked with no interface, the server picks the default one, and the widget
      // stores it so the settings modal has something to show
      expect(instance.interface()).toBe('eth0')
      expect(widget.networkInterface).toBe('eth0')
    })

    it('clears the chart when the interface changes', async () => {
      const { widget } = await open(NetworkWidgetComponent, makeWidget(), {
        arrange: () => io.socket.respondTo('get-server-network-info', netResponse),
      })
      expect(series(widget)).toEqual([8])

      io.socket.respondTo('get-server-network-info', {
        net: { iface: 'wlan0', rx_sec: 0, tx_sec: 0 },
        point: 2,
      })
      ;(widget as any).fetchData()

      // Throughput on a different adapter is a different series entirely
      expect((widget as any).interface()).toBe('wlan0')
      expect(series(widget)).toEqual([2])
    })

    it('flattens a rate below one to zero', async () => {
      const { widget } = await open(NetworkWidgetComponent, makeWidget(), {
        arrange: () => io.socket.respondTo('get-server-network-info', {
          net: { iface: 'eth0', rx_sec: 100, tx_sec: 100 },
          point: 0.02,
        }),
      })

      // Fractional values make the chart look like noise on an idle connection
      expect(series(widget)).toEqual([0])
    })
  })

  describe('the clock widget', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('fills in the formats when the widget has none', async () => {
      const widget = makeWidget({ component: 'ClockWidgetComponent' })
      await open(ClockWidgetComponent, widget)

      expect(widget.timeFormat).toBe('H:mm')
      expect(widget.dateFormat).toBe('yyyy-MM-dd')
    })

    it('keeps the formats the user chose', async () => {
      const widget = makeWidget({ component: 'ClockWidgetComponent', timeFormat: 'h:mm a', dateFormat: 'EEEE' })
      await open(ClockWidgetComponent, widget)

      expect(widget.timeFormat).toBe('h:mm a')
      expect(widget.dateFormat).toBe('EEEE')
    })

    it('ticks once a second', async () => {
      const { widget } = await open(ClockWidgetComponent, makeWidget({ component: 'ClockWidgetComponent' }))
      const first = widget.currentTime()

      await vi.advanceTimersByTimeAsync(1000)

      expect(widget.currentTime()).not.toBe(first)
    })

    it('stops ticking once it is gone', async () => {
      const { widget } = await open(ClockWidgetComponent, makeWidget({ component: 'ClockWidgetComponent' }))
      const captured = widget

      TestBed.resetTestingModule()
      const last = captured.currentTime()
      await vi.advanceTimersByTimeAsync(5000)

      // A widget removed from the dashboard must not keep waking the page up
      expect(captured.currentTime()).toBe(last)
    })
  })

  describe('the system info widget', () => {
    it('asks for the server and node details', async () => {
      const { widget } = await open(SystemInfoWidgetComponent, makeWidget({ component: 'SystemInfoWidgetComponent' }), {
        arrange: () => {
          io.socket.respondTo('get-homebridge-server-info', { os: { distro: 'Raspbian' }, network: {}, time: {} })
          io.socket.respondTo('nodejs-version-check', { currentVersion: '22.0.0', latestVersion: '22.1.0' })
        },
      })

      expect(widget.serverInfo()).toMatchObject({ os: { distro: 'Raspbian' } })
      expect(widget.nodejsInfo()).toMatchObject({ currentVersion: '22.0.0' })
    })

    it('starts with an empty shape rather than nothing', async () => {
      const { widget } = await open(SystemInfoWidgetComponent, makeWidget({ component: 'SystemInfoWidgetComponent' }), {
        connected: false,
      })

      // The template reads nested fields, so a null here would throw before the
      // first response arrives
      expect(widget.serverInfo()).toEqual({ network: {}, os: {}, time: {} })
      expect(widget.nodejsInfo()).toEqual({})
    })

    it('re-reads everything when the socket reconnects', async () => {
      const { widget } = await open(SystemInfoWidgetComponent, makeWidget({ component: 'SystemInfoWidgetComponent' }), {
        arrange: () => {
          io.socket.respondTo('get-homebridge-server-info', { os: {}, network: {}, time: {} })
          io.socket.respondTo('nodejs-version-check', {})
        },
      })
      void widget
      const before = io.requests.length

      io.markConnected()

      // The server may have been updated while it was away
      expect(io.requests.length).toBe(before + 2)
    })
  })
})
