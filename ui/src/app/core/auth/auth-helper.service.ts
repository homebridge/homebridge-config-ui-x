import { inject, Injectable } from '@angular/core'

import { AuthService } from '@/app/core/auth/auth.service'
import { TokenCacheService } from '@/app/core/auth/token-cache.service'

@Injectable({
  providedIn: 'root',
})
export class AuthHelperService {
  private $auth = inject(AuthService)
  private $tokenCache = inject(TokenCacheService)

  /**
   * Checks if user is authenticated by validating cached token
   * Handles token removal detection and validation errors
   */
  public async isAuthenticated(): Promise<boolean> {
    // Use cached token to reduce localStorage reads
    const token = this.$tokenCache.getToken()
    if (!token) {
      // Token was removed, clear auth state and invalidate cache
      this.$auth.token = null
      this.$auth.user = {}
      this.$tokenCache.invalidateCache()
      return false
    }

    // Validate token and check if still logged in
    try {
      const isLoggedIn = this.$auth.isLoggedIn()

      // If token is expired on client side, clear it immediately
      if (!isLoggedIn) {
        this.$auth.token = null
        this.$auth.user = {}
        this.$tokenCache.invalidateCache()
      }

      return isLoggedIn
    } catch (error) {
      // Token validation failed, clear it and invalidate cache
      console.warn('Token validation error, clearing auth state')
      this.$auth.logout()
      this.$tokenCache.invalidateCache()
      return false
    }
  }
}
