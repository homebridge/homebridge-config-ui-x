import type { FakeApi, FakeToastr } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoryOverviewCacheService } from '@/app/core/caching/accessory-overview-cache.service'
import { ResetIndividualBridgesComponent } from '@/app/modules/settings/reset-individual-bridges/reset-individual-bridges.component'
import { fakeApi, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * "Unpair a bridge" — the modal that deletes pairing information.
 *
 * ⚠️ **This is destructive and cannot be undone.** Deleting a pairing makes every
 * accessory on that bridge disappear from the Home app, along with the rooms and
 * automations they were in; the user has to add them again by hand. So the list the
 * user ticks has to be exactly what gets sent, and nothing else.
 *
 * ⚠️ **The bridges are sorted into three lists** — child bridges that are running,
 * bridges that look stale (the plugin is gone but the pairing is still there), and
 * everything else. A stale bridge shown as active invites the user to unpair a
 * bridge they still use.
 */
describe('resetIndividualBridgesComponent', () => {
  let api: FakeApi
  let toastr: FakeToastr
  let overview: { get: ReturnType<typeof vi.fn>, invalidate: ReturnType<typeof vi.fn> }
  let activeModal: { close: ReturnType<typeof vi.fn>, dismiss: ReturnType<typeof vi.fn> }

  /**
   * A pairing as the accessory overview reports it.
   * @param overrides - fields to change
   */
  function pairing(overrides: Record<string, any> = {}) {
    return {
      _id: 'ABC123',
      _username: '0E:11:22:33:44:55',
      name: 'Kitchen Bridge',
      _main: false,
      _category: 'bridge',
      _couldBeStale: false,
      ...overrides,
    }
  }

  /**
   * Open the modal.
   * @param options - how to set it up
   * @param options.pairings - what the overview reports
   * @param options.matter - whether matter support is on
   */
  function open(options: { pairings?: any[], matter?: boolean } = {}) {
    TestBed.resetTestingModule()
    api = fakeApi()
    toastr = toastrStub()
    activeModal = { close: vi.fn(), dismiss: vi.fn() }
    overview = {
      get: vi.fn(async () => ({ pairings: options.pairings ?? [pairing()] })),
      invalidate: vi.fn(),
    }

    TestBed.configureTestingModule({
      imports: [ResetIndividualBridgesComponent],
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({
          api,
          toastr,
          activeModal,
          settings: makeSettings({ env: { featureFlags: { matterSupport: options.matter ?? false } } }),
        }),
        { provide: AccessoryOverviewCacheService, useValue: overview },
      ],
    })

    TestBed.overrideComponent(ResetIndividualBridgesComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    // ⚠️ The modal navigates to /restart with a bare `void`, and no route is
    // registered here. Left to the real router that is an unhandled rejection per
    // case, which fails the run on its exit code while every test still reports as
    // passing. The case that checks the navigation re-spies on top of this.
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)

    const fixture = TestBed.createComponent(ResetIndividualBridgesComponent)
    fixture.detectChanges()
    return fixture.componentInstance
  }

  async function settle() {
    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  describe('the bridges it lists', () => {
    it('lists a running child bridge as active', async () => {
      const modal = open({ pairings: [pairing({ name: 'Kitchen Bridge' })] })
      await settle()

      expect(modal.pairingsChildActive().map(p => p.name)).toEqual(['Kitchen Bridge'])
      expect(modal.pairingsChildStale()).toEqual([])
    })

    it('lists a bridge that may be stale separately', async () => {
      // Its plugin has gone, so unpairing it is usually what the user wants — but
      // showing it among the live ones would invite unpairing a bridge in use
      const modal = open({ pairings: [pairing({ _couldBeStale: true })] })
      await settle()

      expect(modal.pairingsChildStale()).toHaveLength(1)
      expect(modal.pairingsChildActive()).toEqual([])
    })

    it('lists anything that is not a child bridge on its own', async () => {
      const modal = open({ pairings: [pairing({ _category: 'external', name: 'A Camera' })] })
      await settle()

      expect(modal.pairingsNonChild().map(p => p.name)).toEqual(['A Camera'])
      expect(modal.pairingsChildActive()).toEqual([])
    })

    it('never offers the main bridge', async () => {
      // Unpairing that is what the other modal does, and it takes everything with it
      const modal = open({ pairings: [pairing({ _main: true, name: 'Homebridge' }), pairing()] })
      await settle()

      const listed = [...modal.pairingsChildActive(), ...modal.pairingsNonChild(), ...modal.pairingsChildStale()]
      expect(listed.map(p => p.name)).toEqual(['Kitchen Bridge'])
    })

    it('sorts them by name', async () => {
      const modal = open({
        pairings: [pairing({ name: 'Zebra Bridge' }), pairing({ name: 'Apple Bridge' })],
      })
      await settle()

      expect(modal.pairingsChildActive().map(p => p.name)).toEqual(['Apple Bridge', 'Zebra Bridge'])
    })

    it('closes itself when the list cannot be read', async () => {
      // An empty modal would look like "no bridges to unpair", which is worse than
      // saying nothing
      overview = { get: vi.fn(), invalidate: vi.fn() }
      const modal = open()
      overview.get.mockRejectedValue(new Error('server unavailable'))
      await (modal as any).loadPairings()

      expect(toastr.error).toHaveBeenCalled()
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('knows whether matter is supported, for the labels', async () => {
      expect(open({ matter: true }).isMatterSupported).toBe(true)
      expect(open({ matter: false }).isMatterSupported).toBe(false)
    })
  })

  describe('choosing what to unpair', () => {
    it('adds a bridge to the list when ticked', async () => {
      const modal = open()
      await settle()

      modal.toggleList('ABC123')

      expect(modal.isInList('ABC123')).toBe(true)
      expect(modal.toDelete()).toEqual([{ id: 'ABC123', resetPairingInfo: false }])
    })

    it('takes it off again when unticked', async () => {
      const modal = open()
      await settle()

      modal.toggleList('ABC123')
      modal.toggleList('ABC123')

      expect(modal.isInList('ABC123')).toBe(false)
      expect(modal.toDelete()).toEqual([])
    })

    it('remembers to reset the pairing information when asked', async () => {
      // The stale list uses this: the pairing record itself goes too
      const modal = open()
      await settle()

      modal.toggleList('ABC123', true)

      expect(modal.toDelete()).toEqual([{ id: 'ABC123', resetPairingInfo: true }])
    })

    it('keeps several bridges in the list', async () => {
      const modal = open()
      await settle()

      modal.toggleList('ABC123')
      modal.toggleList('DEF456')

      expect(modal.toDelete().map(item => item.id)).toEqual(['ABC123', 'DEF456'])
    })

    it('says nothing is ticked to begin with', async () => {
      const modal = open()
      await settle()

      expect(modal.toDelete()).toEqual([])
      expect(modal.isInList('ABC123')).toBe(false)
    })
  })

  describe('unpairing them', () => {
    it('sends exactly what the user ticked', async () => {
      // ⚠️ The one assertion that matters most here: an extra id in this payload
      // unpairs a bridge the user did not choose
      const modal = open()
      await settle()
      modal.toggleList('ABC123')

      await modal.removeBridges()

      expect(api.lastCall('delete', '/server/pairings')?.options?.body)
        .toEqual([{ id: 'ABC123', resetPairingInfo: false }])
    })

    it('sends the payload as a body on the delete', async () => {
      // ⚠️ Not as a second positional argument: the server reads it from the body,
      // and an axios-style call would send nothing at all
      const modal = open()
      await settle()
      modal.toggleList('ABC123')

      await modal.removeBridges()

      expect(api.lastCall('delete', '/server/pairings')?.options).toHaveProperty('body')
    })

    it('forgets the cached accessory overview', async () => {
      // It still lists the accessories of a bridge that no longer exists
      const modal = open()
      await settle()

      await modal.removeBridges()

      expect(overview.invalidate).toHaveBeenCalled()
    })

    it('sends the user to the restart page', async () => {
      // ⚠️ The spy goes on after `open()`: it resets the TestBed, which throws away
      // the injector - and with it any spy taken from an earlier one
      const modal = open()
      await settle()
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)

      await modal.removeBridges()

      expect(activeModal.close).toHaveBeenCalled()
      expect(navigate).toHaveBeenCalledWith(['/restart'], { queryParams: { restarting: true } })
    })

    it('disables the button while it works', async () => {
      const modal = open()
      await settle()

      const pending = modal.removeBridges()
      expect(modal.clicked()).toBe(true)

      await pending
    })

    it('re-enables the button when it fails', async () => {
      // ⚠️ Otherwise the user is left on a modal they cannot retry from
      const modal = open()
      await settle()
      api.fail('delete', '/server/pairings', new Error('server unavailable'))

      await modal.removeBridges()

      expect(modal.clicked()).toBe(false)
      expect(activeModal.close).not.toHaveBeenCalled()
      expect(toastr.error).toHaveBeenCalled()
    })

    it('does not clear the cache when nothing was deleted', async () => {
      const modal = open()
      await settle()
      api.fail('delete', '/server/pairings', new Error('server unavailable'))

      await modal.removeBridges()

      expect(overview.invalidate).not.toHaveBeenCalled()
    })
  })

  it('closes without unpairing anything when dismissed', async () => {
    const modal = open()
    await settle()
    modal.toggleList('ABC123')

    modal.dismissModal()

    expect(activeModal.dismiss).toHaveBeenCalled()
    expect(api.callsTo('delete')).toEqual([])
  })
})
