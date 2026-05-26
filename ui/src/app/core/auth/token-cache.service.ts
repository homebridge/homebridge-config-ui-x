import { Injectable } from '@angular/core'

import { TokenCacheEntry } from '@/app/core/auth/auth.interfaces'
import { environment } from '@/environments/environment'

@Injectable({
  providedIn: 'root',
})
export class TokenCacheService {
  private cache: TokenCacheEntry | null = null
  private readonly CACHE_DURATION_MS = 60000 // 1 minute

  constructor() {
    // Cross-tab logout: when another tab clears or rotates the token in
    // localStorage, the `storage` event fires here. Without this, this
    // tab would keep returning its cached token for up to 60 s after
    // the other tab logged out / refreshed the session.
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === environment.jwt.tokenKey || event.key === null) {
          this.invalidateCache()
        }
      })
    }
  }

  /**
   * Gets the token from cache or localStorage if cache is expired/empty
   */
  public getToken(): string | null {
    const now = Date.now()

    // Check if we have valid cached token
    if (this.cache && (now - this.cache.timestamp) < this.CACHE_DURATION_MS) {
      return this.cache.token
    }

    // Cache expired or empty - read from localStorage
    const token = window.localStorage.getItem(environment.jwt.tokenKey)

    // Update cache
    this.cache = {
      token,
      timestamp: now,
    }

    return token
  }

  /**
   * Invalidates the cache - forces next getToken() to read from localStorage
   */
  public invalidateCache(): void {
    this.cache = null
  }
}
