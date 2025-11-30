import { environment } from '@/environments/environment'

/**
 * Token getter function for JWT authentication
 * Used by JwtModule configuration in main.ts
 */
export const tokenGetter = () => localStorage.getItem(environment.jwt.tokenKey)
