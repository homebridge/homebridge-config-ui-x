import { Injectable } from '@angular/core'

import { TokenCacheEntry } from '@/app/core/auth/auth.interfaces'
import { environment } from '@/environments/environment'

@Injectable({
  providedIn: 'root',
})
export class TokenCacheService {
  private cache: TokenCacheEntry | null = null
  private readonly CACHE_DURATION_MS = 60000 // 1 minute

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
