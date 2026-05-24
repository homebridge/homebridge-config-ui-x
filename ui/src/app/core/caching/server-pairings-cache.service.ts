import { inject, Injectable } from '@angular/core'

import { TtlCacheService } from '@/app/core/caching/ttl-cache.service'
import { ApiService } from '@/app/core/communication/api.service'

const KEY = 'server-pairings'

@Injectable({
  providedIn: 'root',
})
export class ServerPairingsCacheService {
  private $api = inject(ApiService)
  private $cache = inject(TtlCacheService)

  public get<T = any>(): Promise<T> {
    return this.$cache.get<T>(KEY, () => this.$api.get<T>('/server/pairings'))
  }

  public invalidate(): void {
    this.$cache.invalidate(KEY)
  }
}
