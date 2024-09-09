import { AdminGuard } from '@/app/core/auth/admin.guard'
import { AuthGuard } from '@/app/core/auth/auth.guard'
import { AuthService } from '@/app/core/auth/auth.service'
import { environment } from '@/environments/environment'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { JwtModule } from '@auth0/angular-jwt'
import { TranslateModule } from '@ngx-translate/core'

const tokenGetter = () => localStorage.getItem(environment.jwt.tokenKey)

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
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
    AuthService,
    AuthGuard,
    AdminGuard,
  ],
  exports: [],
})
class AuthModule {}

// token getter
export { AuthModule, tokenGetter }
