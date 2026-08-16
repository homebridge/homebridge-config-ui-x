import type { FakeApi, FakeIoNamespace, FakeSettings, FakeWs } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TtlCacheService } from '@/app/core/caching/ttl-cache.service'
import { BridgesWidgetComponent } from '@/app/modules/status/widgets/bridges-widget/bridges-widget.component'
import { fakeApi, fakeWs, makeAuth, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The bridges widget: the main Homebridge instance plus every child bridge, each
 * with a status and a restart button.
 *
 * Two things make this the most intricate widget. First, each bridge shows a HAP
 * icon and a Matter icon whose state comes from config that has two different
 * spellings depending on the running Homebridge version, and whose meaning
 * depends on feature flags - so the icon can mean "off", "externals only", "not
 * running" or "running", and picking the wrong one tells the user their bridge is
 * broken when it is not.
 *
 * Second, it announces restarts to a screen reader, and only when the user asked
 * for one. The row already says "Restarting", so the announcement waits for the
 * status to actually settle before saying what happened - and says it once per
 * click, not once per status event.
 */
describe('bridgesWidgetComponent', () => {
  let api: FakeApi
  let settings: FakeSettings
  let toastr: ReturnType<typeof toastrStub>
  let ws: FakeWs
  let mainIo: FakeIoNamespace
  let childIo: FakeIoNamespace
  let cache: { invalidateAll: ReturnType<typeof vi.fn> }

  /**
   * A child bridge as the child-bridge socket reports it.
   * @param overrides - fields to change
   */
  function makeBridge(overrides: Record<string, any> = {}): any {
    return {
      username: '0E:11:11:11:11:11',
      name: 'Kitchen Bridge',
      plugin: 'homebridge-test',
      status: 'ok',
      paired: true,
      pid: 1234,
      ...overrides,
    }
  }

  /**
   * Build the widget.
   * @param options - how to set it up
   * @param options.featureFlags - the feature flags to enable
   * @param options.status - the main homebridge status
   * @param options.bridges - the child bridges the socket reports
   * @param options.admin - whether the signed-in user is an admin
   */
  async function open(options: {
    featureFlags?: Record<string, boolean>
    status?: Record<string, any>
    bridges?: any[]
    admin?: boolean
  } = {}) {
    TestBed.resetTestingModule()
    api = fakeApi()
    settings = makeSettings({ env: { featureFlags: options.featureFlags ?? {} } })
    toastr = toastrStub()
    ws = fakeWs()
    mainIo = ws.namespace('status')
    childIo = ws.namespace('child-bridges')
    cache = { invalidateAll: vi.fn() }

    mainIo.socket.respondTo('get-homebridge-status', options.status ?? { status: 'ok', name: 'Homebridge' })
    childIo.socket.respondTo('get-homebridge-child-bridge-status', options.bridges ?? [])
    childIo.socket.respondTo('restart-child-bridge', {})

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ api, settings, toastr, ws, auth: makeAuth({ user: { admin: options.admin ?? true } }) }),
        { provide: TtlCacheService, useValue: cache },
      ],
    })

    // Bootstrap tooltips and the icon markup are not what this is about
    TestBed.overrideComponent(BridgesWidgetComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    const fixture = TestBed.createComponent(BridgesWidgetComponent)
    fixture.componentRef.setInput('widget', { component: 'BridgesWidgetComponent' })
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

  describe('listing the bridges', () => {
    it('reads the main homebridge status', async () => {
      const widget = await open({ status: { status: 'ok', name: 'My Homebridge' } })

      expect(widget.homebridgeStatus()).toMatchObject({ status: 'ok', name: 'My Homebridge' })
    })

    it('lists the child bridges by name', async () => {
      const widget = await open({
        bridges: [
          makeBridge({ name: 'Zulu', username: '0E:33:33:33:33:33' }),
          makeBridge({ name: 'Alpha', username: '0E:11:11:11:11:11' }),
        ],
      })

      // Sorted, because the server returns them in config order and the user
      // scans this list looking for one bridge
      expect(widget.childBridges().map(bridge => bridge.name)).toEqual(['Alpha', 'Zulu'])
    })

    it('starts every bridge as not restarting', async () => {
      const widget = await open({ bridges: [makeBridge()] })

      expect(widget.childBridges()[0].restarting).toBe(false)
    })

    it('updates a bridge in place when its status changes', async () => {
      const widget = await open({ bridges: [makeBridge()] })

      childIo.socket.fire('child-bridge-status-update', makeBridge({ status: 'down' }))

      expect(widget.childBridges()).toHaveLength(1)
      expect(widget.childBridges()[0].status).toBe('down')
    })

    it('adds a bridge it has not seen before', async () => {
      const widget = await open({ bridges: [makeBridge({ name: 'Zulu' })] })

      childIo.socket.fire('child-bridge-status-update', makeBridge({ name: 'Alpha', username: '0E:22:22:22:22:22' }))

      // A plugin can be configured while the page is open
      expect(widget.childBridges().map(bridge => bridge.name)).toEqual(['Alpha', 'Zulu'])
    })

    it('marks the main bridge as down when the socket drops', async () => {
      const widget = await open()

      mainIo.socket.fire('disconnect')

      // The server is gone, so its last reported status is no longer true
      expect(widget.homebridgeStatus()?.status).toBe('down')
    })

    it('keeps the bridge name when the socket drops', async () => {
      const widget = await open({ status: { status: 'ok', name: 'My Homebridge' } })

      mainIo.socket.fire('disconnect')

      // Only the status is replaced, so the row does not lose its label
      expect(widget.homebridgeStatus()?.name).toBe('My Homebridge')
    })
  })

  describe('the bridge status icons', () => {
    // The colour and tooltip rules live in ChildBridgeStatusIconsComponent and
    // are tested with it - these cover what the widget still owns: the
    // aria-label's matter check, and mapping the main bridge into the shared
    // icon source shape so its icons obey the same rules as the child rows.
    it('reads no matter config as not enabled for the aria label', async () => {
      const widget = await open({ featureFlags: { matterSupport: true }, bridges: [makeBridge()] })

      expect(widget.isChildMatterEnabled(widget.childBridges()[0])).toBe(false)
    })

    it('treats a configured matter bridge as enabled', async () => {
      const widget = await open({
        featureFlags: { matterSupport: true },
        bridges: [makeBridge({ matterConfig: { port: 5540 } })],
      })

      expect(widget.isChildMatterEnabled(widget.childBridges()[0])).toBe(true)
    })

    it('treats a matter bridge turned off in place as not enabled', async () => {
      // Still configured, so the icon shows, but it is not advertising anything
      const widget = await open({
        featureFlags: { matterSupport: true },
        bridges: [makeBridge({ matterConfig: { port: 5540, enabled: false } })],
      })

      expect(widget.isChildMatterEnabled(widget.childBridges()[0])).toBe(false)
    })

    it('maps the main bridge into the shared icon source', async () => {
      const widget = await open({
        featureFlags: { hapBridgeDisable: true, protocolExternalsOnly: true, matterSupport: true },
        status: { status: 'ok', hap: { enabled: false, externalsOnly: true }, matter: { enabled: true, externalsOnly: true } },
      })

      expect(widget.mainBridgeIconSource()).toEqual({
        status: 'ok',
        hap: { enabled: false, externalsOnly: true },
        matterConfig: { enabled: true, externalsOnly: true },
      })
    })
  })

  describe('what a screen reader hears', () => {
    it('reads the name, the status and the restart action', async () => {
      const widget = await open({ status: { status: 'ok', name: 'My Homebridge' } })

      expect(widget.mainBridgeAriaLabel())
        .toBe('My Homebridge, status.services.label_running, menu.tooltip_restart')
    })

    it('says restarting instead of a status while in transition', async () => {
      const widget = await open({ status: { status: 'pending', name: 'My Homebridge' } })

      // And drops the restart action, because pressing it again does nothing
      expect(widget.mainBridgeAriaLabel())
        .toBe('My Homebridge, status.services.label_restarting')
    })

    it('leaves out the restart action for a non-admin', async () => {
      const widget = await open({ status: { status: 'ok', name: 'My Homebridge' }, admin: false })

      // Non-admins cannot restart anything, so announcing the action would be
      // announcing a button that is not there
      expect(widget.mainBridgeAriaLabel()).toBe('My Homebridge, status.services.label_running')
    })

    it('falls back to Homebridge when the status has no name', async () => {
      const widget = await open({ status: { status: 'ok' } })

      expect(widget.mainBridgeAriaLabel()).toContain('Homebridge,')
    })

    it('adds the matter state when matter is supported', async () => {
      const widget = await open({
        featureFlags: { matterSupport: true },
        status: { status: 'ok', name: 'My Homebridge', matter: { enabled: true } },
      })

      // The icon is always drawn when matter is supported, so the same three
      // states have to be readable
      expect(widget.mainBridgeAriaLabel())
        .toBe('My Homebridge, status.services.label_running, status.services.matter_running, menu.tooltip_restart')
    })

    it('says matter is not enabled when it is not configured', async () => {
      const widget = await open({
        featureFlags: { matterSupport: true },
        status: { status: 'ok', name: 'My Homebridge' },
      })

      expect(widget.mainBridgeAriaLabel()).toContain('status.services.matter_not_enabled')
    })

    it('leaves matter out entirely when the server does not support it', async () => {
      const widget = await open({ status: { status: 'ok', name: 'My Homebridge' } })

      expect(widget.mainBridgeAriaLabel()).not.toContain('matter')
    })

    it('leaves matter out during a transition', async () => {
      const widget = await open({
        featureFlags: { matterSupport: true },
        status: { status: 'pending', name: 'My Homebridge' },
      })

      // The row already says "Restarting"; the matter state is about to change
      // anyway
      expect(widget.mainBridgeAriaLabel()).not.toContain('matter')
    })

    it('reads a child bridge the same way', async () => {
      const widget = await open({ bridges: [makeBridge({ name: 'Kitchen Bridge' })] })

      expect(widget.childBridgeAriaLabel(widget.childBridges()[0]))
        .toBe('Kitchen Bridge, status.services.label_running, menu.tooltip_restart')
    })

    it('says restarting for a child bridge being restarted', async () => {
      const widget = await open({ bridges: [makeBridge()] })
      widget.childBridges.update(bridges => [{ ...bridges[0], restarting: true }])

      expect(widget.childBridgeAriaLabel(widget.childBridges()[0]))
        .toBe('Kitchen Bridge, status.services.label_restarting')
    })
  })

  describe('restarting homebridge', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('asks the server and clears every cache', async () => {
      const widget = await open()

      await widget.restartHomebridge()

      expect(api.lastCall('put', '/server/restart')?.body).toEqual({})
      // Everything cached describes a process that is being replaced
      expect(cache.invalidateAll).toHaveBeenCalled()
      expect(widget.isRestarting()).toBe(true)
    })

    it('stops showing as restarting when homebridge reports itself up', async () => {
      const widget = await open()
      await widget.restartHomebridge()

      mainIo.socket.fire('homebridge-status', { status: 'ok', name: 'Homebridge' })

      expect(widget.isRestarting()).toBe(false)
    })

    it('gives up waiting after fifteen seconds', async () => {
      const widget = await open()
      await widget.restartHomebridge()

      await vi.advanceTimersByTimeAsync(15000)

      // Otherwise a restart that never reports back leaves the row spinning for
      // as long as the page is open
      expect(widget.isRestarting()).toBe(false)
    })

    it('tells the user when the restart cannot be started', async () => {
      const widget = await open()
      api.fail('put', '/server/restart', new Error('offline'))

      await widget.restartHomebridge()

      expect(toastr.at('error')[0].message).toBe('restart.toast_server_restart_error')
      expect(cache.invalidateAll).not.toHaveBeenCalled()
    })
  })

  describe('restarting a child bridge', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('asks the child socket to restart it by id', async () => {
      const widget = await open({ bridges: [makeBridge()] })

      await widget.restartChildBridge(widget.childBridges()[0])

      expect(childIo.requests.at(-1)).toEqual({
        resource: 'restart-child-bridge',
        payload: '0E:11:11:11:11:11',
      })
    })

    it('shows that one bridge as restarting, not all of them', async () => {
      const widget = await open({
        bridges: [makeBridge({ name: 'Alpha', username: '0E:11:11:11:11:11' }), makeBridge({ name: 'Beta', username: '0E:22:22:22:22:22' })],
      })

      void widget.restartChildBridge(widget.childBridges()[0])

      expect(widget.childBridges()[0].restarting).toBe(true)
      expect(widget.childBridges()[1].restarting).toBe(false)
    })

    it('stops showing as restarting when that bridge reports itself up', async () => {
      const widget = await open({ bridges: [makeBridge()] })
      void widget.restartChildBridge(widget.childBridges()[0])

      childIo.socket.fire('child-bridge-status-update', makeBridge({ status: 'ok' }))

      expect(widget.childBridges()[0].restarting).toBe(false)
    })

    it('keeps showing as restarting while it is still down', async () => {
      const widget = await open({ bridges: [makeBridge()] })
      void widget.restartChildBridge(widget.childBridges()[0])

      childIo.socket.fire('child-bridge-status-update', makeBridge({ status: 'down' }))

      // A bridge on its way back up reports down first
      expect(widget.childBridges()[0].restarting).toBe(true)
    })

    it('gives up waiting after fifteen seconds', async () => {
      const widget = await open({ bridges: [makeBridge()] })
      void widget.restartChildBridge(widget.childBridges()[0])

      await vi.advanceTimersByTimeAsync(15000)

      expect(widget.childBridges()[0].restarting).toBe(false)
    })

    it('tells the user when the restart is refused', async () => {
      const widget = await open({ bridges: [makeBridge()] })
      childIo.socket.respondTo('restart-child-bridge', { error: 'not running' })

      await widget.restartChildBridge(widget.childBridges()[0])

      expect(toastr.at('error')[0].message).toBe('status.widget.bridge.restart_error')
    })
  })

  describe('announcing a finished restart', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    /**
     * Drive homebridge through a full user-initiated restart.
     * @param widget - the bridges widget
     * @param finalStatus - the status it settles on
     */
    async function restartHomebridgeAndSettle(widget: BridgesWidgetComponent, finalStatus = 'ok') {
      await widget.restartHomebridge()
      mainIo.socket.fire('homebridge-status', { status: 'pending', name: 'Homebridge' })
      mainIo.socket.fire('homebridge-status', { status: finalStatus, name: 'Homebridge' })
      await vi.advanceTimersByTimeAsync(3000)
    }

    it('says nothing until the status has settled', async () => {
      const widget = await open()
      await widget.restartHomebridge()
      mainIo.socket.fire('homebridge-status', { status: 'pending', name: 'Homebridge' })

      await vi.advanceTimersByTimeAsync(3000)

      // Still pending, so there is nothing to report yet
      expect(widget.homebridgeLiveMessage()).toBe('')
    })

    it('announces the finished state three seconds after it settles', async () => {
      const widget = await open()

      await restartHomebridgeAndSettle(widget)

      // The delay lets plugins finish loading, so the announcement reflects the
      // state the user will actually see
      expect(widget.homebridgeLiveMessage()).toBe('status.widget.bridge.restart_complete_with_status')
    })

    it('clears the announcement so it is not read again', async () => {
      const widget = await open()
      await restartHomebridgeAndSettle(widget)

      await vi.advanceTimersByTimeAsync(3000)

      expect(widget.homebridgeLiveMessage()).toBe('')
    })

    it('announces only once per restart', async () => {
      const widget = await open()
      await widget.restartHomebridge()
      mainIo.socket.fire('homebridge-status', { status: 'pending', name: 'Homebridge' })
      mainIo.socket.fire('homebridge-status', { status: 'ok', name: 'Homebridge' })
      mainIo.socket.fire('homebridge-status', { status: 'ok', name: 'Homebridge' })
      await vi.advanceTimersByTimeAsync(3000)
      const first = widget.homebridgeLiveMessage()

      mainIo.socket.fire('homebridge-status', { status: 'ok', name: 'Homebridge' })
      await vi.advanceTimersByTimeAsync(3000)

      // A live region that repeats is read out again every time
      expect(first).not.toBe('')
      expect(widget.homebridgeLiveMessage()).toBe('')
    })

    it('says nothing when it drops back to restarting before the announcement', async () => {
      // ⚠️ A restart that settles and then goes pending again - a plugin crashing
      // homebridge on load - would otherwise be announced as finished while the
      // row still says "Restarting"
      const widget = await open()
      await widget.restartHomebridge()
      mainIo.socket.fire('homebridge-status', { status: 'pending', name: 'Homebridge' })
      mainIo.socket.fire('homebridge-status', { status: 'ok', name: 'Homebridge' })
      mainIo.socket.fire('homebridge-status', { status: 'pending', name: 'Homebridge' })

      await vi.advanceTimersByTimeAsync(3000)

      expect(widget.homebridgeLiveMessage()).toBe('')
    })

    it('says nothing about a child bridge that drops back to restarting', async () => {
      // The counterpart for the child bridges, which keep this state per bridge
      // rather than in one shared flag
      const widget = await open({ bridges: [makeBridge()] })
      await widget.restartChildBridge(widget.childBridges()[0])
      childIo.socket.fire('child-bridge-status-update', makeBridge({ status: 'pending' }))
      childIo.socket.fire('child-bridge-status-update', makeBridge({ status: 'ok' }))
      childIo.socket.fire('child-bridge-status-update', makeBridge({ status: 'pending' }))

      await vi.advanceTimersByTimeAsync(3000)

      expect(widget.childBridgeLiveMessages()['0E:11:11:11:11:11']).toBeFalsy()
    })

    it('tracks a bridge that has no username by its name', async () => {
      // Every per-bridge record here is keyed by username, falling back to the
      // name. Without the fallback a bridge whose config carries no username
      // is filed under `undefined`, so any two of them share one restart
      // state and one announcement
      const nameless = makeBridge({ username: undefined, name: 'Nameless Bridge' })
      const widget = await open({ bridges: [nameless] })

      await widget.restartChildBridge(widget.childBridges()[0])
      childIo.socket.fire('child-bridge-status-update', { ...nameless, status: 'pending' })
      childIo.socket.fire('child-bridge-status-update', { ...nameless, status: 'ok' })
      await vi.advanceTimersByTimeAsync(3000)

      expect(widget.childBridgeLiveMessages()['Nameless Bridge']).toBeTruthy()
    })

    it('says nothing about a restart the user did not ask for', async () => {
      const widget = await open()

      mainIo.socket.fire('homebridge-status', { status: 'pending', name: 'Homebridge' })
      mainIo.socket.fire('homebridge-status', { status: 'ok', name: 'Homebridge' })
      // Exactly the settle delay, not longer: advancing past the follow-up clear
      // would make an announcement that *was* made look like one that was not
      await vi.advanceTimersByTimeAsync(3000)

      // Homebridge restarts itself for all sorts of reasons; announcing each one
      // would interrupt whatever the user is doing
      expect(widget.homebridgeLiveMessage()).toBe('')
    })

    it('announces a restart that ended with homebridge down', async () => {
      const widget = await open()

      await restartHomebridgeAndSettle(widget, 'down')

      // The whole point of the announcement: telling a screen reader user the
      // restart finished badly
      expect(widget.homebridgeLiveMessage()).toBe('status.widget.bridge.restart_complete_with_status')
    })

    it('announces a finished child bridge restart against that bridge', async () => {
      const widget = await open({ bridges: [makeBridge()] })
      void widget.restartChildBridge(widget.childBridges()[0])

      childIo.socket.fire('child-bridge-status-update', makeBridge({ status: 'pending' }))
      childIo.socket.fire('child-bridge-status-update', makeBridge({ status: 'ok' }))
      await vi.advanceTimersByTimeAsync(3000)

      // Keyed by bridge, so restarting two at once does not cross the messages
      expect(widget.childBridgeLiveMessages()['0E:11:11:11:11:11'])
        .toBe('status.widget.bridge.restart_complete_with_status')
    })

    it('says nothing about a child bridge restarting on its own', async () => {
      const widget = await open({ bridges: [makeBridge()] })

      childIo.socket.fire('child-bridge-status-update', makeBridge({ status: 'pending' }))
      childIo.socket.fire('child-bridge-status-update', makeBridge({ status: 'ok' }))
      await vi.advanceTimersByTimeAsync(3000)

      expect(widget.childBridgeLiveMessages()['0E:11:11:11:11:11']).toBeUndefined()
    })

    it('drops its pending announcements when the widget is removed', async () => {
      const widget = await open()
      await widget.restartHomebridge()
      mainIo.socket.fire('homebridge-status', { status: 'pending', name: 'Homebridge' })
      mainIo.socket.fire('homebridge-status', { status: 'ok', name: 'Homebridge' })

      TestBed.resetTestingModule()
      await vi.advanceTimersByTimeAsync(6000)

      // The widget can be switched off mid-restart, and a timer firing into a
      // destroyed component announces into nothing
      expect(widget.homebridgeLiveMessage()).toBe('')
      expect(mainIo.end).toHaveBeenCalled()
      expect(childIo.end).toHaveBeenCalled()
    })
  })

  /**
   * The spoken confirmation after a restart.
   *
   * ⚠️ **A screen reader gets no visual cue that a restart finished.** The spinner
   * stopping is invisible to it, so the widget puts a message into a live region —
   * but only when it asked for the restart itself, only once the bridge has left
   * "pending", and only after a delay, because the status flaps while a bridge
   * comes back up.
   */
  describe('announcing that a restart finished', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    /**
     * Ask for a restart, then report the bridge coming back.
     * @param widget - the widget
     * @param status - the status the bridge settles on
     */
    async function restartAndSettle(widget: any, status: string) {
      await widget.restartHomebridge()
      // The status goes to pending while it restarts, then to its final value
      mainIo.socket.respondTo('get-homebridge-status', { status: 'pending', name: 'Homebridge' })
      mainIo.socket.fire('homebridge-status', { status: 'pending', name: 'Homebridge' })
      await Promise.resolve()
      mainIo.socket.respondTo('get-homebridge-status', { status, name: 'Homebridge' })
      mainIo.socket.fire('homebridge-status', { status, name: 'Homebridge' })
      await Promise.resolve()
    }

    it('says the restart finished, and what state it came back in', async () => {
      const widget = await open()

      await restartAndSettle(widget, 'ok')
      await vi.advanceTimersByTimeAsync(3000)

      expect(widget.homebridgeLiveMessage()).toBe('status.widget.bridge.restart_complete_with_status')
    })

    it('waits before speaking, because the status flaps on the way up', async () => {
      // ⚠️ Announcing immediately reads out whichever state it happened to pass
      // through first
      const widget = await open()

      await restartAndSettle(widget, 'ok')

      expect(widget.homebridgeLiveMessage()).toBe('')
    })

    it('says nothing when the bridge is still restarting', async () => {
      const widget = await open()

      await widget.restartHomebridge()
      mainIo.socket.respondTo('get-homebridge-status', { status: 'pending', name: 'Homebridge' })
      mainIo.socket.fire('homebridge-status', { status: 'pending', name: 'Homebridge' })
      await vi.advanceTimersByTimeAsync(3000)

      expect(widget.homebridgeLiveMessage()).toBe('')
    })

    it('says nothing about a restart it did not ask for', async () => {
      // Someone else restarted homebridge, or a plugin did
      const widget = await open()

      mainIo.socket.respondTo('get-homebridge-status', { status: 'pending', name: 'Homebridge' })
      mainIo.socket.fire('homebridge-status', { status: 'pending', name: 'Homebridge' })
      await Promise.resolve()
      mainIo.socket.respondTo('get-homebridge-status', { status: 'ok', name: 'Homebridge' })
      mainIo.socket.fire('homebridge-status', { status: 'ok', name: 'Homebridge' })
      await vi.advanceTimersByTimeAsync(6000)

      expect(widget.homebridgeLiveMessage()).toBe('')
    })

    it('clears the message again, so it is not re-read later', async () => {
      const widget = await open()

      await restartAndSettle(widget, 'ok')
      await vi.advanceTimersByTimeAsync(3000)
      expect(widget.homebridgeLiveMessage()).not.toBe('')

      await vi.advanceTimersByTimeAsync(3000)

      expect(widget.homebridgeLiveMessage()).toBe('')
    })

    it('announces a child bridge coming back, by name', async () => {
      const bridge = makeBridge({ status: 'ok' })
      const widget = await open({ bridges: [bridge] })

      void widget.restartChildBridge(widget.childBridges()[0])
      await Promise.resolve()
      childIo.socket.fire('child-bridge-status-update', { ...bridge, status: 'pending' })
      await Promise.resolve()
      childIo.socket.fire('child-bridge-status-update', { ...bridge, status: 'ok' })
      await vi.advanceTimersByTimeAsync(3000)

      expect(widget.childBridgeLiveMessages()[bridge.username])
        .toBe('status.widget.bridge.restart_complete_with_status')
    })

    it('says nothing about a child bridge it did not restart', async () => {
      const bridge = makeBridge({ status: 'ok' })
      const widget = await open({ bridges: [bridge] })

      childIo.socket.fire('child-bridge-status-update', { ...bridge, status: 'pending' })
      await Promise.resolve()
      childIo.socket.fire('child-bridge-status-update', { ...bridge, status: 'ok' })
      await vi.advanceTimersByTimeAsync(6000)

      expect(widget.childBridgeLiveMessages()[bridge.username]).toBeUndefined()
    })

    it('clears a child bridge message again too', async () => {
      const bridge = makeBridge({ status: 'ok' })
      const widget = await open({ bridges: [bridge] })

      void widget.restartChildBridge(widget.childBridges()[0])
      await Promise.resolve()
      childIo.socket.fire('child-bridge-status-update', { ...bridge, status: 'pending' })
      await Promise.resolve()
      childIo.socket.fire('child-bridge-status-update', { ...bridge, status: 'ok' })
      await vi.advanceTimersByTimeAsync(3000)

      await vi.advanceTimersByTimeAsync(3000)

      expect(widget.childBridgeLiveMessages()[bridge.username]).toBe('')
    })
  })
})
