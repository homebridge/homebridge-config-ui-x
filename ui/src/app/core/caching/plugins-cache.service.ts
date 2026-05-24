import { inject, Injectable } from '@angular/core'

import { TtlCacheService } from '@/app/core/caching/ttl-cache.service'
import { ApiService } from '@/app/core/communication/api.service'
import { Plugin } from '@/app/core/plugins/manage-plugins.interfaces'

const KEY = 'plugins-list'

@Injectable({
  providedIn: 'root',
})
export class PluginsCacheService {
  private $api = inject(ApiService)
  private $cache = inject(TtlCacheService)

  public get(): Promise<Plugin[]> {
    return this.$cache.get<Plugin[]>(KEY, () => this.$api.get<Plugin[]>('/plugins'))
  }

  public invalidate(): void {
    this.$cache.invalidate(KEY)
  }
}
