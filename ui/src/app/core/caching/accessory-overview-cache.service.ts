import { inject, Injectable } from '@angular/core'

import { CachedAccessoriesCacheService } from '@/app/core/caching/cached-accessories-cache.service'
import { ServerPairingsCacheService } from '@/app/core/caching/server-pairings-cache.service'
import { TtlCacheService } from '@/app/core/caching/ttl-cache.service'
import { ApiService } from '@/app/core/communication/api.service'

const KEY = 'accessory-overview'

export interface AccessoryOverview<HapAccessory = any, MatterAccessory = any, Pairing = any> {
  hapAccessories: HapAccessory[]
  matterAccessories: MatterAccessory[]
  pairings: Pairing[]
}

/**
 * Wraps GET /server/accessory-overview — the aggregator that replaces
 * the 2-3 separate cached-accessories / matter-accessories / pairings
 * fetches the accessory-management modals used to issue per open.
 *
 * `invalidate()` also clears the per-piece caches so any non-aggregator
 * consumer (e.g. AccessoriesService) re-reads after a mutation here.
 */
@Injectable({
  providedIn: 'root',
})
export class AccessoryOverviewCacheService {
  private $api = inject(ApiService)
  private $cache = inject(TtlCacheService)
  private $accessoryCache = inject(CachedAccessoriesCacheService)
  private $pairingsCache = inject(ServerPairingsCacheService)

  public get<H = any, M = any, P = any>(): Promise<AccessoryOverview<H, M, P>> {
    return this.$cache.get<AccessoryOverview<H, M, P>>(
      KEY,
      () => this.$api.get<AccessoryOverview<H, M, P>>('/server/accessory-overview'),
    )
  }

  public invalidate(): void {
    this.$cache.invalidate(KEY)
    this.$accessoryCache.invalidate()
    this.$pairingsCache.invalidate()
  }
}
