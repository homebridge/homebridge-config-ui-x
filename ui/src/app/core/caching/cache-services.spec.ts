import type { FakeApi } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'

import { AccessoryOverviewCacheService } from '@/app/core/caching/accessory-overview-cache.service'
import { CachedAccessoriesCacheService } from '@/app/core/caching/cached-accessories-cache.service'
import { PluginsCacheService } from '@/app/core/caching/plugins-cache.service'
import { ServerPairingsCacheService } from '@/app/core/caching/server-pairings-cache.service'
import { fakeApi, makeAuth } from '@/testing'
import { provideFakes } from '@/testing/providers'

/**
 * The four wrappers around TtlCacheService. These specs use the real cache so
 * they pin what actually matters: which url each one calls, and which keys an
 * invalidation clears.
 */
describe('cache services', () => {
  let api: FakeApi

  function configure(admin = true) {
    api = fakeApi()
      .respond('get', /^\/plugins/, [{ name: 'homebridge-hue' }])
      .respond('get', '/server/pairings', [{ _id: 'main' }])
      .respond('get', '/server/cached-accessories', [{ UUID: 'hap' }])
      .respond('get', '/server/matter-accessories', [{ uuid: 'matter' }])
      .respond('get', '/server/accessory-overview', { hapAccessories: [], matterAccessories: [], pairings: [] })

    TestBed.configureTestingModule({
      providers: [provideFakes({ api, auth: makeAuth({ user: { admin } }) })],
    })
  }

  describe('PluginsCacheService', () => {
    it('asks for the config blocks when the user is an admin', async () => {
      configure(true)

      await TestBed.inject(PluginsCacheService).get()

      // Admins get the config in the same response so the plugins page can
      // skip a fetch per plugin
      expect(api.lastCall('get')?.url).toBe('/plugins?include=config')
    })

    it('leaves the config out for a non-admin', async () => {
      configure(false)

      await TestBed.inject(PluginsCacheService).get()

      // A non-admin cannot read config blocks and the request would fail
      expect(api.lastCall('get')?.url).toBe('/plugins')
    })

    it('serves the second read from the cache', async () => {
      configure()
      const service = TestBed.inject(PluginsCacheService)

      await service.get()
      await service.get()

      expect(api.callsTo('get')).toHaveLength(1)
    })

    it('re-reads after being invalidated', async () => {
      configure()
      const service = TestBed.inject(PluginsCacheService)

      await service.get()
      service.invalidate()
      await service.get()

      expect(api.callsTo('get')).toHaveLength(2)
    })
  })

  describe('CachedAccessoriesCacheService', () => {
    it('reads hap and matter accessories from their own endpoints', async () => {
      configure()
      const service = TestBed.inject(CachedAccessoriesCacheService)

      await service.getHap()
      await service.getMatter()

      expect(api.callsTo('get', '/server/cached-accessories')).toHaveLength(1)
      expect(api.callsTo('get', '/server/matter-accessories')).toHaveLength(1)
    })

    it('caches the two protocols separately', async () => {
      configure()
      const service = TestBed.inject(CachedAccessoriesCacheService)

      await service.getHap()
      await service.getMatter()
      service.invalidateHap()
      await service.getHap()
      await service.getMatter()

      expect(api.callsTo('get', '/server/cached-accessories')).toHaveLength(2)
      expect(api.callsTo('get', '/server/matter-accessories')).toHaveLength(1)
    })

    it('drops both protocols on a full invalidate', async () => {
      configure()
      const service = TestBed.inject(CachedAccessoriesCacheService)

      await service.getHap()
      await service.getMatter()
      service.invalidate()
      await service.getHap()
      await service.getMatter()

      expect(api.callsTo('get', '/server/cached-accessories')).toHaveLength(2)
      expect(api.callsTo('get', '/server/matter-accessories')).toHaveLength(2)
    })
  })

  describe('ServerPairingsCacheService', () => {
    it('reads the pairings once and caches them', async () => {
      configure()
      const service = TestBed.inject(ServerPairingsCacheService)

      await service.get()
      await service.get()

      expect(api.callsTo('get', '/server/pairings')).toHaveLength(1)
    })
  })

  describe('AccessoryOverviewCacheService', () => {
    it('reads the aggregated overview', async () => {
      configure()

      await TestBed.inject(AccessoryOverviewCacheService).get()

      expect(api.callsTo('get', '/server/accessory-overview')).toHaveLength(1)
    })

    it('also clears the accessory and pairing caches when invalidated', async () => {
      configure()
      const overview = TestBed.inject(AccessoryOverviewCacheService)
      const accessories = TestBed.inject(CachedAccessoriesCacheService)
      const pairings = TestBed.inject(ServerPairingsCacheService)

      await overview.get()
      await accessories.getHap()
      await accessories.getMatter()
      await pairings.get()

      // A destructive action invalidates through the overview, so the
      // per-piece caches have to go too or a consumer reading them directly
      // keeps serving accessories that were just deleted
      overview.invalidate()
      await overview.get()
      await accessories.getHap()
      await accessories.getMatter()
      await pairings.get()

      expect(api.callsTo('get', '/server/accessory-overview')).toHaveLength(2)
      expect(api.callsTo('get', '/server/cached-accessories')).toHaveLength(2)
      expect(api.callsTo('get', '/server/matter-accessories')).toHaveLength(2)
      expect(api.callsTo('get', '/server/pairings')).toHaveLength(2)
    })
  })
})
