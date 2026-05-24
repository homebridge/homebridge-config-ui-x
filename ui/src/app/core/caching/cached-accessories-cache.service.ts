import { inject, Injectable } from '@angular/core'

import { TtlCacheService } from '@/app/core/caching/ttl-cache.service'
import { ApiService } from '@/app/core/communication/api.service'

const HAP_KEY = 'cached-hap-accessories'
const MATTER_KEY = 'cached-matter-accessories'

@Injectable({
  providedIn: 'root',
})
export class CachedAccessoriesCacheService {
  private $api = inject(ApiService)
  private $cache = inject(TtlCacheService)

  public getHap<T = any>(): Promise<T> {
    return this.$cache.get<T>(HAP_KEY, () => this.$api.get<T>('/server/cached-accessories'))
  }

  public getMatter<T = any>(): Promise<T> {
    return this.$cache.get<T>(MATTER_KEY, () => this.$api.get<T>('/server/matter-accessories'))
  }

  public invalidate(): void {
    this.$cache.invalidate(HAP_KEY)
    this.$cache.invalidate(MATTER_KEY)
  }

  public invalidateHap(): void {
    this.$cache.invalidate(HAP_KEY)
  }

  public invalidateMatter(): void {
    this.$cache.invalidate(MATTER_KEY)
  }
}
