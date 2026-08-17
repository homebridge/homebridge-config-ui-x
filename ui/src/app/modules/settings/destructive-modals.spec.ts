import type { FakeApi } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoryOverviewCacheService } from '@/app/core/caching/accessory-overview-cache.service'
import { TtlCacheService } from '@/app/core/caching/ttl-cache.service'
import { REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { RemoveAllAccessoriesComponent } from '@/app/modules/settings/remove-all-accessories/remove-all-accessories.component'
import { RemoveBridgeAccessoriesComponent } from '@/app/modules/settings/remove-bridge-accessories/remove-bridge-accessories.component'
import { RemoveIndividualAccessoriesComponent } from '@/app/modules/settings/remove-individual-accessories/remove-individual-accessories.component'
import { ResetAllBridgesComponent } from '@/app/modules/settings/reset-all-bridges/reset-all-bridges.component'
import { ResetIndividualBridgesComponent } from '@/app/modules/settings/reset-individual-bridges/reset-individual-bridges.component'
import { activeModalStub, fakeApi, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The five modals that throw away pairings or cached accessories. None of it
 * can be undone from the UI - the user re-pairs everything in the Home app -
 * so what matters is that each button reaches exactly the endpoint it claims,
 * with exactly the payload the server expects.
 *
 * These specs are deliberately literal about urls and bodies. A refactor that
 * points one of these buttons at a neighbouring endpoint would otherwise look
 * completely fine.
 */
describe('destructive accessory and bridge modals', () => {
  let api: FakeApi
  let activeModal: ReturnType<typeof activeModalStub>
  let overview: { get: ReturnType<typeof vi.fn>, invalidate: ReturnType<typeof vi.fn> }
  let cache: { invalidateAll: ReturnType<typeof vi.fn> }
  let navigate: ReturnType<typeof vi.fn>
  let toastr: ReturnType<typeof toastrStub>

  const pairings = [
    { _id: 'main-bridge', _username: '0E:AA:AA:AA:AA:AA', _main: true, _category: 'bridge', name: 'Homebridge' },
    { _id: 'hue-bridge', _username: '0E:BB:BB:BB:BB:BB', _main: false, _category: 'bridge', name: 'Hue', _matter: true },
    { _id: 'ring-bridge', _username: '0E:CC:CC:CC:CC:CC', _main: false, _category: 'bridge', name: 'Ring', _couldBeStale: true },
    { _id: 'camera', _username: '0E:DD:DD:DD:DD:DD', _main: false, _category: 'camera', name: 'Doorbell' },
  ]

  const hapAccessories = [
    { UUID: 'uuid-1', displayName: 'Lamp', $cacheFile: 'cachedAccessories.hue-bridge', services: [] },
  ]

  const matterAccessories = [
    { uuid: 'uuid-2', displayName: 'Plug', $deviceId: 'device-2', services: [] },
  ]

  function configure(matterSupport = true) {
    // A spec that wants different feature flags rebuilds the module, so the
    // one the default beforeEach made has to go first
    TestBed.resetTestingModule()
    api = fakeApi()
    activeModal = activeModalStub()
    overview = {
      get: vi.fn(async () => ({ hapAccessories, matterAccessories, pairings })),
      invalidate: vi.fn(),
    }
    cache = { invalidateAll: vi.fn() }
    toastr = toastrStub()

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({
          api,
          settings: makeSettings({ env: { featureFlags: { matterSupport } } }),
          toastr,
          activeModal,
        }),
        { provide: AccessoryOverviewCacheService, useValue: overview },
        { provide: TtlCacheService, useValue: cache },
        { provide: REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA, useValue: { selectedBridge: 'hue-bridge' } },
      ],
    })

    navigate = vi.fn(async () => true)
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate as any)
  }

  /** Build a modal and let its initial read settle. */
  async function open<T>(type: new (...args: any[]) => T): Promise<T> {
    const fixture = TestBed.createComponent(type as any)
    fixture.detectChanges()
    await fixture.whenStable()
    return fixture.componentInstance as T
  }

  beforeEach(() => {
    configure()
  })

  describe('removing every cached accessory', () => {
    it('asks the server to reset the whole cache', async () => {
      const modal = await open(RemoveAllAccessoriesComponent)

      await modal.onResetCachedAccessoriesClick()

      expect(api.lastCall('put', '/server/reset-cached-accessories')?.body).toEqual({})
    })

    it('clears the cached view and sends the user to restart', async () => {
      const modal = await open(RemoveAllAccessoriesComponent)

      await modal.onResetCachedAccessoriesClick()

      expect(overview.invalidate).toHaveBeenCalled()
      expect(activeModal.close).toHaveBeenCalled()
      expect(navigate).toHaveBeenCalledWith(['/restart'], { queryParams: { restarting: true } })
    })

    it('lets the user try again when it fails', async () => {
      api.fail('put', '/server/reset-cached-accessories', new Error('offline'))
      const modal = await open(RemoveAllAccessoriesComponent)

      await modal.onResetCachedAccessoriesClick()

      expect(modal.clicked()).toBe(false)
      expect(navigate).not.toHaveBeenCalled()
    })

    it('leaves matter accessories out of the list when matter is off', async () => {
      configure(false)
      const modal = await open(RemoveAllAccessoriesComponent)

      expect(modal.cachedAccessories()).toHaveLength(hapAccessories.length)
    })
  })

  describe('removing the accessories of chosen bridges', () => {
    it('sends the chosen bridges as the request body', async () => {
      const modal = await open(RemoveBridgeAccessoriesComponent)
      modal.toggleList('hue-bridge', 'hap')

      await modal.cleanBridges()

      // A delete with a body is unusual enough that a refactor could easily
      // drop it and silently delete nothing
      expect(api.lastCall('delete', '/server/pairings/accessories')?.options).toEqual({
        body: [{ id: 'hue-bridge', protocol: 'hap' }],
      })
    })

    it('forgets the cached overview and sends the user to restart', async () => {
      // ⚠️ The overview still lists accessories that no longer exist, and nothing
      // takes effect until homebridge comes back
      const modal = await open(RemoveBridgeAccessoriesComponent)
      modal.toggleList('hue-bridge', 'hap')

      await modal.cleanBridges()

      expect(overview.invalidate).toHaveBeenCalled()
      expect(activeModal.close).toHaveBeenCalled()
      expect(navigate).toHaveBeenCalledWith(['/restart'], { queryParams: { restarting: true } })
    })

    it('lets the user try again when the removal fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const modal = await open(RemoveBridgeAccessoriesComponent)
      api.fail('delete', '/server/pairings/accessories', new Error('server unavailable'))
      modal.toggleList('hue-bridge', 'hap')

      await modal.cleanBridges()

      // ⚠️ Re-enabled, or the modal is stuck with a button that does nothing
      expect(modal.clicked()).toBe(false)
      expect(toastr.error).toHaveBeenCalled()
      expect(activeModal.close).not.toHaveBeenCalled()
    })

    it('closes itself when the bridge list cannot be read', async () => {
      // An empty list would read as "no bridges to clean", which is worse than
      // saying nothing at all
      vi.spyOn(console, 'error').mockImplementation(() => {})
      overview.get.mockRejectedValue(new Error('server unavailable'))

      await open(RemoveBridgeAccessoriesComponent)

      expect(toastr.error).toHaveBeenCalled()
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('offers a matter row only for a bridge that has matter', async () => {
      const modal = await open(RemoveBridgeAccessoriesComponent)

      const rows = modal.pairings().map((pairing: any) => `${pairing._id}:${pairing._protocol}`)
      expect(rows).toContain('hue-bridge:matter')
      expect(rows).not.toContain('ring-bridge:matter')
    })

    it('offers no matter rows at all while matter is off', async () => {
      configure(false)

      const modal = await open(RemoveBridgeAccessoriesComponent)

      expect(modal.pairings().every((pairing: any) => pairing._protocol === 'hap')).toBe(true)
    })

    it('treats the two protocols on one bridge separately', async () => {
      const modal = await open(RemoveBridgeAccessoriesComponent)
      modal.toggleList('hue-bridge', 'hap')
      modal.toggleList('hue-bridge', 'matter')
      modal.toggleList('hue-bridge', 'hap')

      // Un-ticking the hap row must not take the matter row with it
      expect(modal.toDelete()).toEqual([{ id: 'hue-bridge', protocol: 'matter' }])
    })
  })

  describe('removing individual accessories', () => {
    it('sends hap accessories with their cache file', async () => {
      const modal = await open(RemoveIndividualAccessoriesComponent)
      modal.toDelete.set([{ uuid: 'uuid-1', cacheFile: 'cachedAccessories.hue-bridge', protocol: 'hap' } as any])

      await modal.removeAccessories()

      expect(api.lastCall('delete', '/server/cached-accessories')?.options).toEqual({
        body: [{ uuid: 'uuid-1', cacheFile: 'cachedAccessories.hue-bridge' }],
      })
    })

    it('sends matter accessories with their device id instead', async () => {
      const modal = await open(RemoveIndividualAccessoriesComponent)
      modal.toDelete.set([{ uuid: 'uuid-2', deviceId: 'device-2', protocol: 'matter' } as any])

      await modal.removeAccessories()

      // The two protocols use different endpoints and different payload
      // shapes, which is easy to blur together when editing this
      expect(api.lastCall('delete', '/server/matter-accessories')?.options).toEqual({
        body: [{ uuid: 'uuid-2', deviceId: 'device-2' }],
      })
    })

    it('sends both when the selection mixes protocols', async () => {
      const modal = await open(RemoveIndividualAccessoriesComponent)
      modal.toDelete.set([
        { uuid: 'uuid-1', cacheFile: 'cachedAccessories.hue-bridge', protocol: 'hap' } as any,
        { uuid: 'uuid-2', deviceId: 'device-2', protocol: 'matter' } as any,
      ])

      await modal.removeAccessories()

      expect(api.callsTo('delete', '/server/cached-accessories')).toHaveLength(1)
      expect(api.callsTo('delete', '/server/matter-accessories')).toHaveLength(1)
    })

    it('does nothing at all when nothing is selected', async () => {
      const modal = await open(RemoveIndividualAccessoriesComponent)
      modal.toDelete.set([])

      await modal.removeAccessories()

      expect(api.callsTo('delete')).toHaveLength(0)
      expect(navigate).not.toHaveBeenCalled()
    })
  })

  describe('resetting individual bridges', () => {
    it('sends the chosen bridges as the request body', async () => {
      const modal = await open(ResetIndividualBridgesComponent)
      modal.toggleList('hue-bridge', true)

      await modal.removeBridges()

      expect(api.lastCall('delete', '/server/pairings')?.options).toEqual({
        body: [{ id: 'hue-bridge', resetPairingInfo: true }],
      })
    })

    it('remembers whether each bridge should have its pairing info rebuilt', async () => {
      const modal = await open(ResetIndividualBridgesComponent)
      modal.toggleList('hue-bridge', true)
      modal.toggleList('camera', false)

      // Active child bridges are rebuilt; stale ones and external accessories
      // are only removed, and the server decides based on this flag
      expect(modal.toDelete()).toEqual([
        { id: 'hue-bridge', resetPairingInfo: true },
        { id: 'camera', resetPairingInfo: false },
      ])
    })

    it('sends the user to restart afterwards', async () => {
      const modal = await open(ResetIndividualBridgesComponent)
      modal.toggleList('hue-bridge', true)

      await modal.removeBridges()

      expect(overview.invalidate).toHaveBeenCalled()
      expect(navigate).toHaveBeenCalledWith(['/restart'], { queryParams: { restarting: true } })
    })
  })

  describe('resetting every bridge', () => {
    it('hides the reset button until the warning has been read', async () => {
      const modal = await open(ResetAllBridgesComponent)

      // This one unpairs everything and loses every room and automation in
      // the Home app, so it is the only modal with a second step
      expect(modal.confirmMode()).toBe(false)
    })

    it('asks the server to reset the homebridge identity', async () => {
      const modal = await open(ResetAllBridgesComponent)

      await modal.onResetHomebridgeAccessoryClick()

      expect(api.lastCall('put', '/server/reset-homebridge-accessory')?.body).toEqual({})
    })

    it('clears every cache, not just the accessory one', async () => {
      const modal = await open(ResetAllBridgesComponent)

      await modal.onResetHomebridgeAccessoryClick()

      expect(cache.invalidateAll).toHaveBeenCalled()
    })

    it('sends the user to restart without the restarting flag', async () => {
      const modal = await open(ResetAllBridgesComponent)

      await modal.onResetHomebridgeAccessoryClick()

      // Unlike its siblings this one has not started the restart itself
      expect(navigate).toHaveBeenCalledWith(['/restart'])
    })

    it('lets the user try again when it fails', async () => {
      api.fail('put', '/server/reset-homebridge-accessory', new Error('offline'))
      const modal = await open(ResetAllBridgesComponent)

      await modal.onResetHomebridgeAccessoryClick()

      expect(modal.clicked()).toBe(false)
      expect(navigate).not.toHaveBeenCalled()
    })
  })
})
