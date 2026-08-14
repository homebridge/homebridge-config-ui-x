import { Injectable } from '@angular/core'

import { getStoredToken } from '@/app/core/auth/token-store'

/**
 * Reads the current access token.
 *
 * This used to cache the value to avoid repeated localStorage reads. The token
 * now lives in memory (see token-store.ts), so there is nothing to cache and
 * nothing to keep in step across tabs — each tab holds its own token for the
 * life of the page, and a logout clears the HttpOnly cookie server-side so no
 * other tab can restore a session from it.
 */
@Injectable({
  providedIn: 'root',
})
export class TokenCacheService {
  public getToken(): string | null {
    return getStoredToken()
  }

  /**
   * Retained so callers do not need to change. There is no cache to clear.
   */
  public invalidateCache(): void {}
}
