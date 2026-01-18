import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http'
import { importProvidersFrom } from '@angular/core'
import { JwtModule } from '@auth0/angular-jwt'

import { tokenGetter } from '@/app/core/auth/token-getter'
import { environment } from '@/environments/environment'

/**
 * Provides HTTP client configuration with JWT authentication
 * Note: withInterceptorsFromDi() is required for JWT interceptor functionality
 */
export function provideAppHttpClient() {
  return [
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
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
