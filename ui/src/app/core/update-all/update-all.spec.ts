import type { UpdateAllJournal, UpdateAllPlan, UpdateAllPlanItem } from '@/app/core/update-all/update-all.interfaces'
import type { FakeApi, FakeIoNamespace, FakeModalService, FakeSettings, FakeToastr, FakeWs } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TERMINAL_FACTORY } from '@/app/core/utilities/terminal.factory'
import { activeModalStub, fakeApi, fakeTerminals, fakeWs, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The Update All feature: one modal that carries the plan, the run and the
 * summary.
 *
 * ⚠️ The component is loaded with `await import()` and imported above as types
 * only. A top-level value import evaluates it against the real xterm before the
 * mock registry is consulted, and the mock then records nothing - which reads as
 * the component being broken.
 */
describe('update all', () => {
  let xterm: ReturnType<typeof fakeTerminals>
  let api: FakeApi
  let toastr: FakeToastr
  let settings: FakeSettings
  let activeModal: ReturnType<typeof activeModalStub>

  async function settle() {
    for (let tick = 0; tick < 12; tick += 1) {
      await Promise.resolve()
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the plan modal', () => {
    let modal: FakeModalService

    function planItem(overrides: Partial<UpdateAllPlanItem> = {}): UpdateAllPlanItem {
      return {
        type: 'plugin',
        name: 'homebridge-example',
        from: '1.0.0',
        to: '1.1.0',
        ...overrides,
      }
    }

    function makePlan(overrides: Partial<UpdateAllPlan> = {}): UpdateAllPlan {
      return { items: [], needsReview: [], skipped: [], ...overrides }
    }

    /**
     * Open the plan modal.
     * @param options - how to set it up
     * @param options.plan - what the server answers with for the plan
     * @param options.arrange - runs on the fresh fakes before the modal is built
     */
    async function open(options: { plan?: UpdateAllPlan, arrange?: (fakes: { api: FakeApi }) => void } = {}) {
      TestBed.resetTestingModule()
      api = fakeApi()
      toastr = toastrStub()
      settings = makeSettings()
      activeModal = activeModalStub()
      modal = modalServiceSpy()
      // One component now carries the run as well as the plan, so it injects the
      // ws service even while only the plan is on screen. Nothing here reaches
      // the run, so the namespace only has to exist.
      const planWs = fakeWs()
      api.respond('get', '/update-all/plan', options.plan ?? makePlan({ items: [planItem()] }))
      api.respond('post', '/update-all/start', {})

      const { UpdateAllModalComponent } = await import('@/app/core/update-all/update-all-modal.component')

      xterm = fakeTerminals()

      TestBed.configureTestingModule({
        imports: [UpdateAllModalComponent],
        providers: [
          { provide: TERMINAL_FACTORY, useValue: xterm.factory },
          provideTestTranslate(),
          provideFakes({ api, toastr, settings, activeModal, modal, ws: planWs }),
        ],
      })

      TestBed.overrideComponent(UpdateAllModalComponent, {
        set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
      })

      options.arrange?.({ api })

      const fixture = TestBed.createComponent(UpdateAllModalComponent)
      fixture.detectChanges()
      await settle()
      return { component: fixture.componentInstance, fixture }
    }

    it('loads the plan and stops showing the loading state', async () => {
      const { component } = await open({ plan: makePlan({ items: [planItem(), planItem({ name: 'homebridge-other' })] }) })

      expect(component.phase()).toBe('plan')
      expect(component.plan().items).toHaveLength(2)
      expect(component.selectedCount()).toBe(2)
    })

    it('reports a failed plan lookup and closes itself', async () => {
      // Nothing can be confirmed without a plan, so staying open would offer an
      // empty list with no explanation
      const { component } = await open({ arrange: ({ api }) => api.fail('get', '/update-all/plan', new Error('nope')) })

      expect(toastr.error).toHaveBeenCalledWith(expect.anything(), 'toast.title_error')
      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
      expect(component.phase()).toBe('loading')
    })

    it('unticks and reticks an item', async () => {
      const { component } = await open({ plan: makePlan({ items: [planItem(), planItem({ name: 'homebridge-other' })] }) })

      component.toggleItem('homebridge-example')

      expect(component.isTicked('homebridge-example')).toBe(false)
      expect(component.selectedCount()).toBe(1)

      component.toggleItem('homebridge-example')

      expect(component.isTicked('homebridge-example')).toBe(true)
      expect(component.selectedCount()).toBe(2)
    })

    it('falls back to the homebridge icon when a plugin icon fails to load', async () => {
      const { component } = await open()
      const item = component.plan().items[0]

      component.handleIconError(item)

      expect(item.icon).toBe('assets/hb-icon.png')
    })

    it('reports whether there is anything to review or skipped', async () => {
      const { component } = await open({
        plan: makePlan({
          items: [planItem()],
          needsReview: [{ ...planItem({ name: 'homebridge-major' }), reason: 'major' }],
        }),
      })

      expect(component.hasNeedsReview()).toBe(true)
      expect(component.hasSkipped()).toBe(false)
    })

    describe('the restart plan it previews', () => {
      it('counts one homebridge restart and no child bridges when homebridge itself is updating', async () => {
        // A homebridge restart takes every child bridge with it, so counting
        // them as well would promise the user more restarts than happen
        const { component } = await open({
          plan: makePlan({
            items: [
              planItem({ type: 'homebridge', name: 'homebridge' }),
              planItem({ name: 'homebridge-child', childBridgeUsernames: ['AA:BB:CC:DD:EE:FF'] }),
            ],
          }),
        })

        expect(component.restartPlan()).toEqual({ ui: false, homebridge: true, childBridgeCount: 0 })
      })

      it('treats a plugin on the main bridge as a homebridge restart', async () => {
        const { component } = await open({
          plan: makePlan({ items: [planItem({ childBridgeUsernames: [] })] }),
        })

        expect(component.restartPlan()).toEqual({ ui: false, homebridge: true, childBridgeCount: 0 })
      })

      it('counts each child bridge once when only child-bridged plugins are updating', async () => {
        // Two plugins sharing a child bridge is one restart, not two
        const { component } = await open({
          plan: makePlan({
            items: [
              planItem({ name: 'homebridge-a', childBridgeUsernames: ['AA:BB:CC:DD:EE:FF'] }),
              planItem({ name: 'homebridge-b', childBridgeUsernames: ['AA:BB:CC:DD:EE:FF', '11:22:33:44:55:66'] }),
            ],
          }),
        })

        expect(component.restartPlan()).toEqual({ ui: false, homebridge: false, childBridgeCount: 2 })
      })

      it('flags the ui restart independently of the homebridge one', async () => {
        const { component } = await open({
          plan: makePlan({ items: [planItem({ type: 'ui', name: 'homebridge-config-ui-x', childBridgeUsernames: ['AA:BB:CC:DD:EE:FF'] })] }),
        })

        expect(component.restartPlan()).toEqual({ ui: true, homebridge: false, childBridgeCount: 1 })
      })

      it('follows the ticks rather than the whole plan', async () => {
        const { component } = await open({
          plan: makePlan({
            items: [
              planItem({ type: 'homebridge', name: 'homebridge' }),
              planItem({ name: 'homebridge-child', childBridgeUsernames: ['AA:BB:CC:DD:EE:FF'] }),
            ],
          }),
        })

        component.toggleItem('homebridge')

        expect(component.restartPlan()).toEqual({ ui: false, homebridge: false, childBridgeCount: 1 })
      })
    })

    describe('confirming', () => {
      it('sends only the ticked items, as name and target version', async () => {
        // The server re-validates against a fresh plan, so the modal echoes the
        // plan's `to` rather than choosing a version itself
        const { component } = await open({
          plan: makePlan({ items: [planItem(), planItem({ name: 'homebridge-other', to: '2.0.0' })] }),
        })
        component.toggleItem('homebridge-example')

        await component.confirm()

        expect(api.lastCall('post', '/update-all/start')?.body).toEqual({
          items: [{ name: 'homebridge-other', to: '2.0.0' }],
        })
      })

      it('keeps the rows and the description on screen, so nothing moves under the cursor', async () => {
        const { component } = await open({
          plan: makePlan({ items: [planItem(), planItem({ name: 'homebridge-other' })] }),
        })
        const before = component.rows().map(x => x.name)

        await component.confirm()

        // No spinner in between and no empty list: the same rows carry straight
        // on, and the description above them stays put
        expect(component.phase()).not.toBe('loading')
        expect(component.rows().map(x => x.name)).toEqual(before)
      })

      it('keeps an unticked row in place, marked as not part of the run', async () => {
        const { component } = await open({
          plan: makePlan({ items: [planItem(), planItem({ name: 'homebridge-other' })] }),
        })
        component.toggleItem('homebridge-example')

        await component.confirm()

        // It stays where it was rather than vanishing from under the user - the
        // row keeps its (now disabled) toggle instead of taking a status
        expect(component.rows().map(x => x.name)).toEqual(['homebridge-example', 'homebridge-other'])
        expect(component.rows().find(x => x.name === 'homebridge-example')?.excluded).toBe(true)
        expect(component.rows().find(x => x.name === 'homebridge-other')?.excluded).toBeFalsy()
      })

      it('leaves an excluded row out of the restart it predicts', async () => {
        const { component } = await open({
          plan: makePlan({
            items: [
              planItem({ name: 'homebridge-main' }),
              planItem({ name: 'homebridge-bridged', childBridgeUsernames: ['AA:BB'] }),
            ],
          }),
        })
        // The only main-bridge plugin is unticked, so nothing calls for a full restart
        component.toggleItem('homebridge-main')

        await component.confirm()

        expect(component.restartPlan().homebridge).toBe(false)
        expect(component.restartPlan().childBridgeCount).toBe(1)
      })

      it('carries on into the run in place, without opening a second modal', async () => {
        const { component } = await open()

        await component.confirm()

        // The rows the user was just looking at stay exactly where they are -
        // only their right-hand cell changes, from a toggle to a status
        expect(activeModal.close).not.toHaveBeenCalled()
        expect(modal.lastOpened()).toBeUndefined()
        expect(component.phase()).not.toBe('plan')
      })

      it('does nothing when everything has been unticked', async () => {
        const { component } = await open()
        component.toggleItem('homebridge-example')

        await component.confirm()

        expect(api.callsTo('post', '/update-all/start')).toHaveLength(0)
        expect(modal.opened).toHaveLength(0)
      })

      it('starts one run however many times the button is pressed', async () => {
        // Two runs at once would have npm fighting itself over node_modules
        const { component } = await open()

        await Promise.all([component.confirm(), component.confirm(), component.confirm()])

        expect(api.callsTo('post', '/update-all/start')).toHaveLength(1)
      })

      it('reports a failed start and lets the user try again', async () => {
        const { component } = await open({ arrange: ({ api }) => api.fail('post', '/update-all/start', new Error('nope')) })

        await component.confirm()

        expect(toastr.error).toHaveBeenCalledWith(expect.anything(), 'toast.title_error')
        expect(component.starting()).toBe(false)
        expect(activeModal.close).not.toHaveBeenCalled()
        expect(modal.opened).toHaveLength(0)
      })
    })

    it('dismisses when closed', async () => {
      const { component } = await open()

      component.dismissModal()

      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
    })
  })

  describe('the progress modal', () => {
    let ws: FakeWs
    let io: FakeIoNamespace

    function makeJournal(overrides: Partial<UpdateAllJournal> = {}): UpdateAllJournal {
      return {
        schemaVersion: 1,
        runId: 'run-1',
        startedAt: '2026-08-19T10:00:00.000Z',
        acknowledged: false,
        items: [
          { type: 'plugin', name: 'homebridge-example', from: '1.0.0', to: '1.1.0', status: 'planned' },
          { type: 'plugin', name: 'homebridge-other', from: '2.0.0', to: '2.1.0', status: 'planned' },
        ],
        restart: { homebridge: 'pending', ui: 'pending' },
        ...overrides,
      }
    }

    /**
     * Open the progress modal.
     * @param options - how to set it up
     * @param options.active - whether the server says a run is still going
     * @param options.journal - the journal in the subscribe snapshot
     * @param options.arrange - runs on the fresh fakes before the modal is built
     */
    async function open(options: {
      active?: boolean
      journal?: UpdateAllJournal | null
      arrange?: (fakes: { api: FakeApi, io: FakeIoNamespace }) => void
    } = {}) {
      TestBed.resetTestingModule()
      vi.useFakeTimers()
      api = fakeApi()
      toastr = toastrStub()
      settings = makeSettings()
      activeModal = activeModalStub()
      ws = fakeWs()
      io = ws.namespace('update-all')

      const journal = options.journal === undefined ? makeJournal() : options.journal
      io.socket.respondTo('subscribe', { active: options.active ?? true, journal })
      api.respond('get', '/update-all/journal', journal)
      api.respond('post', '/update-all/cancel', {})
      api.respond('post', '/update-all/journal/ack', {})

      const { UpdateAllModalComponent } = await import('@/app/core/update-all/update-all-modal.component')
      const { UPDATE_ALL_MODAL_DATA } = await import('@/app/core/update-all/update-all.interfaces')

      xterm = fakeTerminals()

      TestBed.configureTestingModule({
        imports: [UpdateAllModalComponent],
        providers: [
          { provide: TERMINAL_FACTORY, useValue: xterm.factory },
          // These reopen a run that already exists - the layout does the same
          // after the UI restarts itself - so the plan phase is skipped
          { provide: UPDATE_ALL_MODAL_DATA, useValue: { resume: true } },
          // A real router with the one route this can hand over to. Without the
          // route the navigation rejects, and because the component fires it
          // with `void` that surfaced as an unhandled rejection that failed the
          // whole run from a spec that otherwise passed.
          provideRouter([{ path: 'restart', children: [] }]),
          provideTestTranslate(),
          provideFakes({ api, toastr, settings, activeModal, ws }),
        ],
      })

      TestBed.overrideComponent(UpdateAllModalComponent, {
        set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
      })

      options.arrange?.({ api, io })

      const fixture = TestBed.createComponent(UpdateAllModalComponent)
      fixture.detectChanges()
      await settle()
      // The terminal pane is only in the DOM once the progress branch has
      // rendered, which is why the component defers its lookup by a tick
      fixture.detectChanges()
      vi.advanceTimersByTime(1)
      return { component: fixture.componentInstance, fixture }
    }

    it('subscribes to the run and shows its progress', async () => {
      const { component } = await open({ active: true })

      expect(ws.connectToNamespace).toHaveBeenCalledWith('update-all')
      expect(io.requests.map(request => request.resource)).toEqual(['subscribe'])
      expect(component.phase()).toBe('progress')
      expect(component.journal()?.items).toHaveLength(2)
    })

    it('opens a terminal for the npm output', async () => {
      await open({ active: true })

      expect(xterm.terminals).toHaveLength(1)
      expect(xterm.terminals[0].open).toHaveBeenCalled()
    })

    it('goes straight to the summary when the run has already finished', async () => {
      // The UI restarting itself reopens this modal after the run ended
      const { component } = await open({ active: false })

      expect(component.phase()).toBe('summary')
      expect(xterm.terminals).toHaveLength(0)
    })

    it('re-reads the journal from disk for the summary', async () => {
      // The snapshot's copy predates the restart outcomes
      const finished = makeJournal({ finishedAt: '2026-08-19T10:05:00.000Z', restart: { homebridge: 'done', ui: 'scheduled' } })
      const { component } = await open({
        active: false,
        arrange: ({ api }) => api.respond('get', '/update-all/journal', finished),
      })

      expect(component.journal()?.restart).toEqual({ homebridge: 'done', ui: 'scheduled' })
    })

    /**
     * The hand-over to the restart page, which had no coverage at all - the
     * navigation was only visible as an unhandled rejection in the run output.
     * `uiRestarting` is the half that matters: it tells the restart page the UI
     * is going down too, so it shows that row as pending rather than ticked.
     */
    it('hands over to the restart page when the run calls for a restart', async () => {
      const finished = makeJournal({ finishedAt: '2026-08-19T10:05:00.000Z', restart: { homebridge: 'done', ui: 'scheduled' } })
      await open({
        active: false,
        arrange: ({ api }) => api.respond('get', '/update-all/journal', finished),
      })

      const router = TestBed.inject(Router)
      await router.navigated

      expect(activeModal.close).toHaveBeenCalled()
      expect(router.url).toBe('/restart?restarting=true&uiRestarting=true')
    })

    it('stays put when nothing the run did needs a restart', async () => {
      const finished = makeJournal({ finishedAt: '2026-08-19T10:05:00.000Z', restart: { homebridge: 'not-needed', ui: 'not-needed' } })
      await open({
        active: false,
        arrange: ({ api }) => api.respond('get', '/update-all/journal', finished),
      })

      expect(TestBed.inject(Router).url).toBe('/')
    })

    it('still shows the summary when the journal cannot be re-read', async () => {
      const { component } = await open({
        active: false,
        arrange: ({ api }) => api.fail('get', '/update-all/journal', new Error('nope')),
      })

      expect(component.phase()).toBe('summary')
    })

    it('reports a failed subscribe and closes itself', async () => {
      const { component } = await open({
        arrange: ({ io }) => io.socket.respondTo('subscribe', { error: 'nope' }),
      })

      expect(toastr.error).toHaveBeenCalledWith(expect.anything(), 'toast.title_error')
      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
      expect(component.phase()).toBe('loading')
    })

    describe('live events', () => {
      it('marks an item running when it starts', async () => {
        const { component } = await open()

        io.socket.fire('item-start', { name: 'homebridge-example' })

        expect(component.journal()?.items.find(item => item.name === 'homebridge-example')?.status).toBe('running')
        expect(component.journal()?.items.find(item => item.name === 'homebridge-other')?.status).toBe('planned')
      })

      it('records the result an item finished with', async () => {
        const { component } = await open()

        io.socket.fire('item-result', { name: 'homebridge-other', status: 'failed' })

        expect(component.journal()?.items.find(item => item.name === 'homebridge-other')?.status).toBe('failed')
      })

      it('ignores item events that arrive before the journal', async () => {
        const { component } = await open({ journal: null, active: true })

        io.socket.fire('item-start', { name: 'homebridge-example' })

        expect(component.journal()).toBeNull()
      })

      it('writes npm output into the terminal', async () => {
        await open({ active: true })

        io.socket.fire('stdout', { name: 'homebridge-example', data: 'added 1 package\r\n' })

        expect(xterm.terminals[0].written).toEqual(['added 1 package\r\n'])
      })

      it('shows the summary when the run completes', async () => {
        const { component } = await open({ active: true })
        expect(component.phase()).toBe('progress')

        io.socket.fire('run-complete')
        await settle()

        expect(component.phase()).toBe('summary')
      })

      it('says so while the server is away, and recovers on reconnect', async () => {
        // The server goes down while the UI updates itself - appearing frozen
        // would read as a hung update
        const { component } = await open({ active: true })

        io.socket.fire('disconnect')

        expect(component.disconnected()).toBe(true)

        io.markConnected()
        await settle()

        expect(component.disconnected()).toBe(false)
        // The fresh server-side socket has to be re-registered, or the rest of
        // the run streams into nothing
        expect(io.requests.map(request => request.resource)).toEqual(['subscribe', 'subscribe'])
      })
    })

    describe('cancelling', () => {
      it('asks the server to stop and says so', async () => {
        const { component } = await open({ active: true })

        await component.cancelRun()

        expect(api.callsTo('post', '/update-all/cancel')).toHaveLength(1)
        expect(component.cancelRequested()).toBe(true)
      })

      it('reports a failed cancel and lets the user ask again', async () => {
        const { component } = await open({
          active: true,
          arrange: ({ api }) => api.fail('post', '/update-all/cancel', new Error('nope')),
        })

        await component.cancelRun()

        expect(toastr.error).toHaveBeenCalledWith(expect.anything(), 'toast.title_error')
        expect(component.cancelRequested()).toBe(false)
      })
    })

    describe('what a row shows', () => {
      it('reads an unfinished item as incomplete in the summary', async () => {
        // A spinner in the summary would look alive for ever - these mean the
        // run died mid-item, e.g. a power cut during the ui update
        const { component } = await open({ active: false })

        expect(component.displayStatus('running')).toBe('incomplete')
        expect(component.displayStatus('planned')).toBe('incomplete')
      })

      it('leaves finished statuses alone in the summary', async () => {
        const { component } = await open({ active: false })

        expect(component.displayStatus('ok')).toBe('ok')
        expect(component.displayStatus('failed')).toBe('failed')
        expect(component.displayStatus('skipped')).toBe('skipped')
      })

      it('keeps a running item running while the run is live', async () => {
        const { component } = await open({ active: true })

        expect(component.displayStatus('running')).toBe('running')
      })
    })

    describe('closing', () => {
      it('acknowledges the journal so the summary is shown once', async () => {
        const { component } = await open({ active: false })

        component.closeModal()

        expect(api.callsTo('post', '/update-all/journal/ack')).toHaveLength(1)
        expect(activeModal.close).toHaveBeenCalled()
      })

      it('closes even when the acknowledgement fails', async () => {
        // A failed ack only means the summary appears once more
        const { component } = await open({
          active: false,
          arrange: ({ api }) => api.fail('post', '/update-all/journal/ack', new Error('nope')),
        })

        component.closeModal()
        await settle()

        expect(activeModal.close).toHaveBeenCalled()
      })

      it('does not acknowledge a run that is still going', async () => {
        // The summary has not been seen yet, so it must still be shown later
        const { component } = await open({ active: true })

        component.closeModal()

        expect(api.callsTo('post', '/update-all/journal/ack')).toHaveLength(0)
        expect(activeModal.close).toHaveBeenCalled()
      })
    })

    describe('teardown', () => {
      it('detaches its own listeners without touching the shared socket', async () => {
        // The namespace socket is cached and shared, so removeAllListeners()
        // would silently break whatever else is listening on it
        const { fixture } = await open({ active: true })
        expect(io.socket.handlers('item-start')).toHaveLength(1)

        fixture.destroy()

        expect(io.socket.handlers('item-start')).toHaveLength(0)
        expect(io.socket.handlers('stdout')).toHaveLength(0)
        expect(io.socket.removeAllListeners).not.toHaveBeenCalled()
      })

      it('disposes the terminal and ends the namespace', async () => {
        const { fixture } = await open({ active: true })

        fixture.destroy()

        expect(xterm.terminals[0].dispose).toHaveBeenCalled()
        expect(io.end).toHaveBeenCalled()
      })

      it('stops listening for reconnects', async () => {
        const { fixture } = await open({ active: true })

        fixture.destroy()
        io.markConnected()
        await settle()

        // One from the original connect, and none after teardown
        expect(io.requests).toHaveLength(1)
      })
    })
  })
})
