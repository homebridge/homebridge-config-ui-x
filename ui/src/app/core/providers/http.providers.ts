import { provideHttpClient, withFetch, withInterceptors, withInterceptorsFromDi } from '@angular/common/http'
import { importProvidersFrom } from '@angular/core'
import { JwtModule } from '@auth0/angular-jwt'

import { authInterceptor } from '@/app/core/auth/auth.interceptor'
import { tokenGetter } from '@/app/core/auth/token-getter'
import { environment } from '@/environments/environment'

/**
 * Provides HTTP client configuration with JWT authentication
 * Note: withInterceptorsFromDi() is required for JWT interceptor functionality
 */
export function provideAppHttpClient() {
  return [
    provideHttpClient(withFetch(), withInterceptors([authInterceptor]), withInterceptorsFromDi()),
    importProvidersFrom(
      JwtModule.forRoot({
        config: {
          authScheme: 'bearer ',
          tokenGetter,
          skipWhenExpired: false,
          allowedDomains: environment.jwt.allowedDomains,
          disallowedRoutes: environment.jwt.disallowedRoutes,
        },
      }),
    ),
  ]
}
