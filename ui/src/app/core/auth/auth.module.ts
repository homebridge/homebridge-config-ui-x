import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { JwtModule } from '@auth0/angular-jwt';
import { TranslateModule } from '@ngx-translate/core';

import { environment } from '@/environments/environment';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';

// token getter
export const tokenGetter = () => localStorage.getItem(environment.jwt.tokenKey);

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
export class AuthModule { }
