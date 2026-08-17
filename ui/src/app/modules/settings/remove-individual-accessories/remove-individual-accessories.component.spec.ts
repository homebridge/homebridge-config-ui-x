import type { FakeApi, FakeToastr } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoryOverviewCacheService } from '@/app/core/caching/accessory-overview-cache.service'
import { REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { RemoveIndividualAccessoriesComponent } from '@/app/modules/settings/remove-individual-accessories/remove-individual-accessories.component'
import { fakeApi, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * "Remove single cached accessories" — the modal that deletes accessories from the
 * cache on disk.
 *
 * ⚠️ **Deleting the wrong entry cannot be undone.** The accessory disappears from
 * the Home app with its room and automations, and the user has to add it again. So
 * the identity of each entry has to be exact: HAP accessories are identified by
 * uuid **and** cache file, because the same uuid can appear under several bridges,
 * and matter accessories by uuid and device id instead.
 *
 * ⚠️ **HAP and matter go to different endpoints.** Sending a matter accessory to the
 * HAP endpoint deletes nothing and reports success.
 */
describe('removeIndividualAccessoriesComponent', () => {
  let api: FakeApi
  let toastr: FakeToastr
  let overview: { get: ReturnType<typeof vi.fn>, invalidate: ReturnType<typeof vi.fn> }
  let activeModal: { close: ReturnType<typeof vi.fn>, dismiss: ReturnType<typeof vi.fn> }

  /**
   * A cached HAP accessory.
   * @param name - its display name
   * @param cacheFile - the cache file it lives in
   * @param uuid - its UUID
   */
  function hap(name: string, cacheFile = 'cachedAccessories', uuid = `uuid-${name}`) {
    return { displayName: name, UUID: uuid, $cacheFile: cacheFile }
  }

  /**
   * A cached matter accessory.
   * @param name - its display name
   * @param deviceId - the matter device it belongs to
   * @param uuid - its UUID
   */
  function matter(name: string, deviceId = 'matter-device-1', uuid = `uuid-${name}`) {
    return { displayName: name, UUID: uuid, $deviceId: deviceId }
  }

  /**
   * A pairing.
   * @param overrides - fields to change
   */
  function pairing(overrides: Record<string, any> = {}) {
    return { _id: 'ABC123', _username: '0E:11:22:33:44:55', name: 'Kitchen Bridge', _main: false, ...overrides }
  }

  /**
   * Open the modal.
   * @param options - how to set it up
   * @param options.hapAccessories - the cached HAP accessories
   * @param options.matterAccessories - the cached matter accessories
   * @param options.pairings - the known pairings
   * @param options.selectedBridge - the bridge the caller pre-selected
   * @param options.highlightUuid - an accessory to scroll to and highlight
   * @param options.highlightCacheFile - the cache file that accessory is in
   * @param options.matterSupported - whether matter support is on
   */
  function open(options: {
    hapAccessories?: any[]
    matterAccessories?: any[]
    pairings?: any[]
    selectedBridge?: string
    highlightUuid?: string
    highlightCacheFile?: string
    matterSupported?: boolean
  } = {}) {
    TestBed.resetTestingModule()
    api = fakeApi()
    toastr = toastrStub()
    activeModal = { close: vi.fn(), dismiss: vi.fn() }
    overview = {
      get: vi.fn(async () => ({
        hapAccessories: options.hapAccessories ?? [hap('Kitchen Light')],
        matterAccessories: options.matterAccessories ?? [],
        pairings: options.pairings ?? [pairing({ _main: true, _id: 'MAIN00' })],
      })),
      invalidate: vi.fn(),
    }

    TestBed.configureTestingModule({
      imports: [RemoveIndividualAccessoriesComponent],
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({
          api,
          toastr,
          activeModal,
          settings: makeSettings({ env: { featureFlags: { matterSupport: options.matterSupported ?? true } } }),
        }),
        { provide: AccessoryOverviewCacheService, useValue: overview },
        {
          provide: REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA,
          useValue: {
            selectedBridge: options.selectedBridge ?? '',
            highlightUuid: options.highlightUuid,
            highlightCacheFile: options.highlightCacheFile,
          },
        },
      ],
    })

    TestBed.overrideComponent(RemoveIndividualAccessoriesComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    // ⚠️ The modal navigates to /restart with a bare `void`, and no route is
    // registered here. Left to the real router that is an unhandled rejection per
    // case, which fails the run on its exit code while every test still reports as
    // passing. The case that checks the navigation re-spies on top of this.
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)

    const fixture = TestBed.createComponent(RemoveIndividualAccessoriesComponent)
    fixture.detectChanges()
    return fixture.componentInstance
  }

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

  describe('the accessories it lists', () => {
    it('groups them under the bridge they belong to', async () => {
      const modal = open({
        hapAccessories: [hap('Kitchen Light', 'cachedAccessories.ABC123')],
        pairings: [pairing({ _id: 'ABC123', name: 'Kitchen Bridge' })],
      })
      await settle()

      expect(modal.pairings().map(p => p.name)).toEqual(['Kitchen Bridge'])
      expect(modal.pairings()[0].accessories.map((a: any) => a.displayName)).toEqual(['Kitchen Light'])
    })

    it('puts an accessory with no bridge in the file name under the main bridge', async () => {
      // `cachedAccessories` with no suffix is the main bridge's own file
      const modal = open({
        hapAccessories: [hap('Kitchen Light', 'cachedAccessories')],
        pairings: [pairing({ _id: 'MAIN00', name: 'Homebridge', _main: true })],
      })
      await settle()

      expect(modal.pairings()[0].name).toBe('Homebridge')
    })

    it('invents a bridge entry for a cache file with no pairing left', async () => {
      // The pairing was deleted but its cache file is still on disk — which is
      // exactly the mess this modal exists to clear up
      const modal = open({
        hapAccessories: [hap('Orphan', 'cachedAccessories.0E1122334455')],
        pairings: [pairing({ _id: 'MAIN00', _main: true })],
      })
      await settle()

      const orphan = modal.pairings().find(p => p._id === '0E1122334455')
      expect(orphan?.name).toBe('reset.accessory_ind.unknown')
      expect(orphan?._username).toBe('0E:11:22:33:44:55')
    })

    it('lists the accessories of each bridge in name order', async () => {
      const modal = open({
        hapAccessories: [hap('Zebra', 'cachedAccessories'), hap('Apple', 'cachedAccessories')],
        pairings: [pairing({ _id: 'MAIN00', _main: true })],
      })
      await settle()

      expect(modal.pairings()[0].accessories.map((a: any) => a.displayName)).toEqual(['Apple', 'Zebra'])
    })

    it('puts the main bridge first, then the rest by name', async () => {
      const modal = open({
        hapAccessories: [
          hap('One', 'cachedAccessories'),
          hap('Two', 'cachedAccessories.ZZZ'),
          hap('Three', 'cachedAccessories.AAA'),
        ],
        pairings: [
          pairing({ _id: 'MAIN00', name: 'Homebridge', _main: true }),
          pairing({ _id: 'ZZZ', name: 'Zebra Bridge' }),
          pairing({ _id: 'AAA', name: 'Apple Bridge' }),
        ],
      })
      await settle()

      expect(modal.pairings().map(p => p.name)).toEqual(['Homebridge', 'Apple Bridge', 'Zebra Bridge'])
    })

    it('leaves out a bridge with nothing cached', async () => {
      const modal = open({
        hapAccessories: [hap('Kitchen Light', 'cachedAccessories')],
        pairings: [
          pairing({ _id: 'MAIN00', name: 'Homebridge', _main: true }),
          pairing({ _id: 'EMPTY', name: 'Empty Bridge' }),
        ],
      })
      await settle()

      expect(modal.pairings().map(p => p.name)).toEqual(['Homebridge'])
    })

    it('lists matter accessories under their device', async () => {
      const modal = open({
        hapAccessories: [],
        matterAccessories: [matter('Matter Lamp', 'matter-device-1')],
        pairings: [pairing({ _id: 'MAIN00', _main: true })],
      })
      await settle()

      const device = modal.pairings().find(p => p._id === 'matter-device-1')
      expect(device?.accessories.map((a: any) => a.displayName)).toEqual(['Matter Lamp'])
      expect(device?.accessories[0].$protocol).toBe('matter')
    })

    it('ignores matter accessories entirely when matter is off', async () => {
      const modal = open({
        hapAccessories: [],
        matterAccessories: [matter('Matter Lamp')],
        pairings: [pairing({ _id: 'MAIN00', _main: true })],
        matterSupported: false,
      })
      await settle()

      expect(modal.pairings()).toEqual([])
    })

    it('shows only the bridge it was opened for', async () => {
      // Reached from one accessory's own info modal
      const modal = open({
        hapAccessories: [hap('Kitchen Light', 'cachedAccessories.ABC123'), hap('Hall Light', 'cachedAccessories.DEF456')],
        pairings: [pairing({ _id: 'ABC123' }), pairing({ _id: 'DEF456', name: 'Hall Bridge' })],
        selectedBridge: 'ABC123',
      })
      await settle()

      expect(modal.pairings()).toHaveLength(1)
      expect(modal.selectedBridgeAccessories().map((a: any) => a.displayName)).toEqual(['Kitchen Light'])
    })

    it('selects the first bridge when none was asked for', async () => {
      const modal = open({
        hapAccessories: [hap('Kitchen Light', 'cachedAccessories')],
        pairings: [pairing({ _id: 'MAIN00', name: 'Homebridge', _main: true })],
      })
      await settle()

      expect(modal.currentSelectedBridge()).toBe('MAIN00')
      expect(modal.accessoriesExist()).toBe(true)
    })

    it('says there is nothing cached when there is nothing', async () => {
      const modal = open({ hapAccessories: [], pairings: [pairing({ _main: true, _id: 'MAIN00' })] })
      await settle()

      expect(modal.accessoriesExist()).toBe(false)
      expect(modal.pairings()).toEqual([])
    })

    it('closes itself when the cache cannot be read', async () => {
      const modal = open()
      overview.get.mockRejectedValue(new Error('server unavailable'))
      await (modal as any).loadCachedAccessories()

      expect(toastr.error).toHaveBeenCalled()
      expect(activeModal.close).toHaveBeenCalled()
    })
  })

  describe('switching between bridges', () => {
    it('shows the accessories of the bridge just picked', async () => {
      const modal = open({
        hapAccessories: [hap('Kitchen Light', 'cachedAccessories.ABC123'), hap('Hall Light', 'cachedAccessories.DEF456')],
        pairings: [pairing({ _id: 'ABC123' }), pairing({ _id: 'DEF456', name: 'Hall Bridge' })],
      })
      await settle()

      modal.onBridgeChange({ target: { value: 'DEF456' } } as unknown as Event)

      expect(modal.selectedBridgeAccessories().map((a: any) => a.displayName)).toEqual(['Hall Light'])
    })

    it('shows nothing for a bridge it does not know', async () => {
      const modal = open()
      await settle()

      modal.onBridgeChange({ target: { value: 'NOPE' } } as unknown as Event)

      expect(modal.selectedBridgeAccessories()).toEqual([])
    })

    it('names the selected bridge with its username', async () => {
      const modal = open({
        hapAccessories: [hap('Kitchen Light', 'cachedAccessories.ABC123')],
        pairings: [pairing({ _id: 'ABC123', name: 'Kitchen Bridge', _username: '0E:11:22:33:44:55' })],
      })
      await settle()

      expect(modal.getCurrentlySelectedBridge()).toBe('Kitchen Bridge - 0E:11:22:33:44:55')
    })

    it('names nothing when no bridge is selected', async () => {
      const modal = open({ hapAccessories: [], pairings: [pairing({ _main: true, _id: 'MAIN00' })] })
      await settle()

      expect(modal.getCurrentlySelectedBridge()).toBe('')
    })
  })

  describe('choosing what to remove', () => {
    it('ticks an accessory', async () => {
      const modal = open()
      await settle()

      modal.toggleList('uuid-1', 'cachedAccessories', 'hap')

      expect(modal.isInList('uuid-1', 'cachedAccessories', 'hap')).toBe(true)
    })

    it('unticks it again', async () => {
      const modal = open()
      await settle()

      modal.toggleList('uuid-1', 'cachedAccessories', 'hap')
      modal.toggleList('uuid-1', 'cachedAccessories', 'hap')

      expect(modal.toDelete()).toEqual([])
    })

    it('treats the same uuid in two cache files as two accessories', async () => {
      // ⚠️ The identity is the pair, not the uuid: the same accessory uuid can
      // exist under two bridges, and ticking one must not tick the other
      const modal = open()
      await settle()

      modal.toggleList('uuid-1', 'cachedAccessories.ABC', 'hap')

      expect(modal.isInList('uuid-1', 'cachedAccessories.ABC', 'hap')).toBe(true)
      expect(modal.isInList('uuid-1', 'cachedAccessories.DEF', 'hap')).toBe(false)
    })

    it('treats a hap and a matter entry with one uuid as two accessories', async () => {
      const modal = open()
      await settle()

      modal.toggleList('uuid-1', 'cachedAccessories', 'hap')

      expect(modal.isInList('uuid-1', 'cachedAccessories', 'matter')).toBe(false)
    })

    it('remembers the matter device an entry belongs to', async () => {
      // It is what identifies the accessory on the matter endpoint
      const modal = open()
      await settle()

      modal.toggleList('uuid-1', 'matter-device-1', 'matter', 'matter-device-1')

      expect(modal.toDelete()).toEqual([
        { cacheFile: 'matter-device-1', uuid: 'uuid-1', protocol: 'matter', deviceId: 'matter-device-1' },
      ])
    })
  })

  describe('highlighting the accessory the user came from', () => {
    it('highlights it when there is more than one to choose between', async () => {
      const modal = open({
        hapAccessories: [hap('One', 'cachedAccessories', 'uuid-1'), hap('Two', 'cachedAccessories', 'uuid-2')],
        pairings: [pairing({ _id: 'MAIN00', _main: true })],
        highlightUuid: 'uuid-1',
        highlightCacheFile: 'cachedAccessories',
      })
      await settle()

      expect(modal.shouldHighlight('uuid-1', 'cachedAccessories')).toBe(true)
      expect(modal.shouldHighlight('uuid-2', 'cachedAccessories')).toBe(false)
    })

    it('highlights nothing when there is only one accessory anyway', async () => {
      // Highlighting the only row on the page is noise
      const modal = open({
        hapAccessories: [hap('One', 'cachedAccessories', 'uuid-1')],
        pairings: [pairing({ _id: 'MAIN00', _main: true })],
        highlightUuid: 'uuid-1',
        highlightCacheFile: 'cachedAccessories',
      })
      await settle()

      expect(modal.shouldHighlight('uuid-1', 'cachedAccessories')).toBe(false)
    })

    it('highlights nothing when the caller asked for nothing', async () => {
      const modal = open({
        hapAccessories: [hap('One', 'cachedAccessories', 'uuid-1'), hap('Two', 'cachedAccessories', 'uuid-2')],
        pairings: [pairing({ _id: 'MAIN00', _main: true })],
      })
      await settle()

      expect(modal.shouldHighlight('uuid-1', 'cachedAccessories')).toBe(false)
    })

    it('does not highlight the same uuid in a different cache file', async () => {
      const modal = open({
        hapAccessories: [hap('One', 'cachedAccessories', 'uuid-1'), hap('Two', 'cachedAccessories', 'uuid-2')],
        pairings: [pairing({ _id: 'MAIN00', _main: true })],
        highlightUuid: 'uuid-1',
        highlightCacheFile: 'cachedAccessories.OTHER',
      })
      await settle()

      expect(modal.shouldHighlight('uuid-1', 'cachedAccessories')).toBe(false)
    })

    it('scrolls the highlighted row into view once the modal has faded in', async () => {
      vi.useFakeTimers()
      const scrollIntoView = vi.fn()
      const row = document.createElement('div')
      row.className = 'list-group-item-highlight'
      ;(row as any).scrollIntoView = scrollIntoView
      document.body.appendChild(row)

      open({
        hapAccessories: [hap('One', 'cachedAccessories', 'uuid-1'), hap('Two', 'cachedAccessories', 'uuid-2')],
        pairings: [pairing({ _id: 'MAIN00', _main: true })],
        highlightUuid: 'uuid-1',
        highlightCacheFile: 'cachedAccessories',
      })
      await vi.advanceTimersByTimeAsync(250)

      expect(scrollIntoView).toHaveBeenCalled()
      row.remove()
    })
  })

  describe('removing them', () => {
    it('sends the hap accessories to the hap endpoint', async () => {
      const modal = open()
      await settle()
      modal.toggleList('uuid-1', 'cachedAccessories', 'hap')

      await modal.removeAccessories()

      expect(api.lastCall('delete', '/server/cached-accessories')?.options?.body)
        .toEqual([{ uuid: 'uuid-1', cacheFile: 'cachedAccessories' }])
    })

    it('sends the matter accessories to the matter endpoint', async () => {
      // ⚠️ Sending these to the HAP endpoint deletes nothing and reports success
      const modal = open()
      await settle()
      modal.toggleList('uuid-2', 'matter-device-1', 'matter', 'matter-device-1')

      await modal.removeAccessories()

      expect(api.lastCall('delete', '/server/matter-accessories')?.options?.body)
        .toEqual([{ uuid: 'uuid-2', deviceId: 'matter-device-1' }])
      expect(api.callsTo('delete', '/server/cached-accessories')).toEqual([])
    })

    it('sends both when the user picked both', async () => {
      const modal = open()
      await settle()
      modal.toggleList('uuid-1', 'cachedAccessories', 'hap')
      modal.toggleList('uuid-2', 'matter-device-1', 'matter', 'matter-device-1')

      await modal.removeAccessories()

      expect(api.callsTo('delete', '/server/cached-accessories')).toHaveLength(1)
      expect(api.callsTo('delete', '/server/matter-accessories')).toHaveLength(1)
    })

    it('never touches the matter endpoint while matter is off', async () => {
      const modal = open({ matterSupported: false })
      await settle()
      modal.toggleList('uuid-2', 'matter-device-1', 'matter', 'matter-device-1')

      await modal.removeAccessories()

      expect(api.callsTo('delete')).toEqual([])
      expect(modal.clicked()).toBe(false)
    })

    it('does nothing at all when nothing is ticked', async () => {
      const modal = open()
      await settle()

      await modal.removeAccessories()

      expect(api.callsTo('delete')).toEqual([])
      expect(modal.clicked()).toBe(false)
      expect(activeModal.close).not.toHaveBeenCalled()
    })

    it('forgets the cached overview and sends the user to restart', async () => {
      const modal = open()
      await settle()
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
      modal.toggleList('uuid-1', 'cachedAccessories', 'hap')

      await modal.removeAccessories()

      expect(overview.invalidate).toHaveBeenCalled()
      expect(activeModal.close).toHaveBeenCalled()
      expect(navigate).toHaveBeenCalledWith(['/restart'], { queryParams: { restarting: true } })
    })

    it('re-enables the button when the delete fails', async () => {
      const modal = open()
      await settle()
      api.fail('delete', '/server/cached-accessories', new Error('server unavailable'))
      modal.toggleList('uuid-1', 'cachedAccessories', 'hap')

      await modal.removeAccessories()

      expect(modal.clicked()).toBe(false)
      expect(activeModal.close).not.toHaveBeenCalled()
      expect(toastr.error).toHaveBeenCalled()
      expect(overview.invalidate).not.toHaveBeenCalled()
    })

    it('fails as a whole when only the matter half fails', async () => {
      // Half a deletion is worse than none: the user has to be told
      const modal = open()
      await settle()
      api.fail('delete', '/server/matter-accessories', new Error('server unavailable'))
      modal.toggleList('uuid-1', 'cachedAccessories', 'hap')
      modal.toggleList('uuid-2', 'matter-device-1', 'matter', 'matter-device-1')

      await modal.removeAccessories()

      expect(toastr.error).toHaveBeenCalled()
      expect(activeModal.close).not.toHaveBeenCalled()
    })
  })

  it('closes without deleting anything when dismissed', async () => {
    const modal = open()
    await settle()
    modal.toggleList('uuid-1', 'cachedAccessories', 'hap')

    modal.dismissModal()

    expect(activeModal.dismiss).toHaveBeenCalled()
    expect(api.callsTo('delete')).toEqual([])
  })
})
