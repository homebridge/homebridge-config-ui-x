import { NgModule } from '@angular/core'
import { JwtModule } from '@auth0/angular-jwt'

import { AdminGuard } from '@/app/core/auth/admin.guard'
import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { AuthGuard } from '@/app/core/auth/auth.guard'
import { AuthService } from '@/app/core/auth/auth.service'
import { TokenCacheService } from '@/app/core/auth/token-cache.service'
import { environment } from '@/environments/environment'

const tokenGetter = () => localStorage.getItem(environment.jwt.tokenKey)

@NgModule({
  imports: [
    JwtModule.forRoot({
      config: {
        authScheme: 'bearer ',
        tokenGetter,
        skipWhenExpired: false,
        allowedDomains: environment.jwt.allowedDomains,
        disallowedRoutes: environment.jwt.disallowedRoutes,
      },
    }),
  ],
  providers: [
    AuthHelperService,
    AuthService,
    AuthGuard,
    AdminGuard,
    TokenCacheService,
  ],
  exports: [],
})
class AuthModule {}

// Token getter
export { AuthModule, tokenGetter }
