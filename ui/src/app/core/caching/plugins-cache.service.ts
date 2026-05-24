import { inject, Injectable } from '@angular/core'

import { AuthService } from '@/app/core/auth/auth.service'
import { TtlCacheService } from '@/app/core/caching/ttl-cache.service'
import { ApiService } from '@/app/core/communication/api.service'
import { Plugin } from '@/app/core/plugins/manage-plugins.interfaces'

const KEY = 'plugins-list'

@Injectable({
  providedIn: 'root',
})
export class PluginsCacheService {
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $cache = inject(TtlCacheService)

  // Admin sessions opt into `?include=config` so the plugins page can
  // skip the per-plugin /config-editor/plugin/:name fan-out. Non-admin
  // sessions can't read config blocks and would 403 on the param.
  public get(): Promise<Plugin[]> {
    const path = this.$auth.user.admin ? '/plugins?include=config' : '/plugins'
    return this.$cache.get<Plugin[]>(KEY, () => this.$api.get<Plugin[]>(path))
  }

  public invalidate(): void {
    this.$cache.invalidate(KEY)
  }
}
