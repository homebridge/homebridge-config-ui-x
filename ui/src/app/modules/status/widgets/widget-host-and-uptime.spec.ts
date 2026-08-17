import type { FakeIoNamespace, FakeWs } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UptimeWidgetComponent } from '@/app/modules/status/widgets/uptime-widget/uptime-widget.component'
import { WidgetsComponent } from '@/app/modules/status/widgets/widgets.component'
import { fakeWs, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The uptime widget, and the host that puts any widget on the dashboard.
 */
describe('the dashboard widget host', () => {
  let ws: FakeWs

  /** A widget as the dashboard layout holds it. */
  function makeWidget(component: string) {
    return {
      component,
      $resizeEvent: new Subject<void>(),
      $configureEvent: new Subject<void>(),
    } as any
  }

  /**
   * Put a widget on the dashboard.
   * @param widget - the widget config
   */
  function host(widget: any) {
    TestBed.resetTestingModule()
    ws = fakeWs()
    ws.namespace('status')

    TestBed.configureTestingModule({
      imports: [WidgetsComponent],
      providers: [provideTestTranslate(), provideFakes({ ws, settings: makeSettings(), toastr: toastrStub() })],
    })

    const fixture = TestBed.createComponent(WidgetsComponent)
    fixture.componentRef.setInput('widget', widget)
    fixture.detectChanges()
    return fixture
  }

  it('builds the widget it was asked for', async () => {
    const { ClockWidgetComponent } = await import('@/app/modules/status/widgets/clock-widget/clock-widget.component')
    const fixture = host(makeWidget('ClockWidgetComponent'))

    expect(fixture.nativeElement.children).toHaveLength(1)
    expect((fixture.componentInstance as any).componentRef.componentType).toBe(ClockWidgetComponent)
  })

  it('makes it fill the tile it was given', () => {
    // The dashboard sizes the tile; the widget has to stretch into it or it sits
    // in the corner of an empty box
    const fixture = host(makeWidget('ClockWidgetComponent'))

    const rendered = fixture.nativeElement.children[0] as HTMLElement
    expect(rendered.style.height).toBe('100%')
    expect(rendered.style.width).toBe('100%')
    expect(rendered.style.display).toBe('flex')
  })

  it('hands the widget its resize and configure streams', () => {
    // ⚠️ Assigned onto the instance rather than passed as inputs, so a widget that
    // declares them as inputs instead would silently never be told to redraw
    const widget = makeWidget('ClockWidgetComponent')

    const fixture = host(widget)

    const rendered = (fixture.componentInstance as any).componentRef.instance
    expect(rendered.resizeEvent).toBe(widget.$resizeEvent)
    expect(rendered.configureEvent).toBe(widget.$configureEvent)
  })

  it('hands the widget its own config', () => {
    const widget = makeWidget('ClockWidgetComponent')

    const fixture = host(widget)

    expect((fixture.componentInstance as any).componentRef.instance.widget()).toBe(widget)
  })

  it('builds nothing for a widget name it does not know', () => {
    // A layout saved by a newer version can name a widget this one does not have
    const fixture = host(makeWidget('SomeWidgetFromTheFuture'))

    expect(fixture.nativeElement.children).toHaveLength(0)
  })

  it('closes the widget streams when the tile goes', () => {
    // They are per-tile, so leaving them open leaks a subscription per widget the
    // user removes.
    //
    // ⚠️ Asserted through a completion handler, not `subject.closed`: `complete()`
    // stops a Subject but does not close it, so a `closed` check passes whether the
    // streams were completed or not
    const widget = makeWidget('ClockWidgetComponent')
    const fixture = host(widget)
    const completed: string[] = []
    widget.$resizeEvent.subscribe({ complete: () => completed.push('resize') })
    widget.$configureEvent.subscribe({ complete: () => completed.push('configure') })

    fixture.destroy()

    expect(completed).toEqual(['resize', 'configure'])
  })

  it('leaves the streams alone when there was no widget to build', () => {
    const widget = makeWidget('SomeWidgetFromTheFuture')
    const fixture = host(widget)
    const completed: string[] = []
    widget.$resizeEvent.subscribe({ complete: () => completed.push('resize') })

    fixture.destroy()

    expect(completed).toEqual([])
  })
})

/**
 * The uptime widget.
 *
 * ⚠️ **It polls, because uptime only ever goes up.** Nothing pushes it, so the
 * widget asks every eleven seconds — and only while the socket is up, or every
 * tick queues a request that resolves when the connection comes back and floods
 * the widget with stale answers.
 */
describe('uptimeWidgetComponent', () => {
  let ws: FakeWs
  let io: FakeIoNamespace

  /**
   * Build the widget.
   * @param options - how to set it up
   * @param options.connected - whether the status socket starts connected
   * @param options.uptime - the server uptime in seconds
   * @param options.processUptime - the homebridge process uptime in seconds
   */
  function create(options: { connected?: boolean, uptime?: number, processUptime?: number } = {}) {
    TestBed.resetTestingModule()
    ws = fakeWs()
    io = ws.namespace('status', { connected: options.connected ?? true })
    io.socket.respondTo('get-server-uptime-info', {
      time: { uptime: options.uptime ?? 3600 },
      processUptime: options.processUptime ?? 60,
    })

    TestBed.configureTestingModule({
      imports: [UptimeWidgetComponent],
      providers: [provideTestTranslate(), provideFakes({ ws, settings: makeSettings(), toastr: toastrStub() })],
    })

    TestBed.overrideComponent(UptimeWidgetComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    const fixture = TestBed.createComponent(UptimeWidgetComponent)
    fixture.componentRef.setInput('widget', { component: 'UptimeWidgetComponent' })
    fixture.detectChanges()
    return fixture
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks for the uptime as soon as the socket is up', () => {
    const fixture = create()

    expect(io.requests.map(r => r.resource)).toEqual(['get-server-uptime-info'])
    expect(fixture.componentInstance.serverUptime()).toBe('1h')
    expect(fixture.componentInstance.processUptime()).toBe('1m')
  })

  it('asks again every eleven seconds', async () => {
    create()

    await vi.advanceTimersByTimeAsync(11000)

    expect(io.requests).toHaveLength(2)
  })

  it('stops asking while the socket is down', async () => {
    // ⚠️ Otherwise every tick queues a request that all resolve at once when the
    // connection returns
    create()
    io.socket.connected = false

    await vi.advanceTimersByTimeAsync(33000)

    expect(io.requests).toHaveLength(1)
  })

  it('asks nothing at all before the socket connects', () => {
    const fixture = create({ connected: false })

    expect(io.requests).toEqual([])
    expect(fixture.componentInstance.serverUptime()).toBe('')
  })

  it('catches up when the socket connects', () => {
    create({ connected: false })

    io.markConnected()

    expect(io.requests.map(r => r.resource)).toEqual(['get-server-uptime-info'])
  })

  it('stops asking once the widget is gone', async () => {
    const fixture = create()

    fixture.destroy()
    await vi.advanceTimersByTimeAsync(33000)

    expect(io.requests).toHaveLength(1)
  })

  it.each([
    [0, '< 1m'],
    [49, '< 1m'],
    [50, '1m'],
    [90, '2m'],
    [3599, '60m'],
    [3600, '1h'],
    [86399, '24h'],
    [86400, '1d'],
    [172800, '2d'],
    [259199, '2d'],
  ])('shows %i seconds as %s', (seconds, expected) => {
    // Rounded below a day and truncated above it: "2d" for anything in the third
    // day, because "3d" for two and a half days reads as wrong
    const fixture = create({ uptime: seconds })

    expect(fixture.componentInstance.serverUptime()).toBe(expected)
  })

  it('reports the two uptimes separately', () => {
    // Homebridge restarting does not restart the machine, and the gap between the
    // two is the useful part
    const fixture = create({ uptime: 172800, processUptime: 120 })

    expect(fixture.componentInstance.serverUptime()).toBe('2d')
    expect(fixture.componentInstance.processUptime()).toBe('2m')
  })
})
