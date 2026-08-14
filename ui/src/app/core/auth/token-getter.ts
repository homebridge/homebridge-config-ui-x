import { getStoredToken } from '@/app/core/auth/token-store'

/**
 * Token getter function for JWT authentication
 * Used by JwtModule configuration in main.ts
 *
 * Reads the in-memory token rather than localStorage — see token-store.ts.
 */
export const tokenGetter = () => getStoredToken()
