import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { JwtModule } from '@auth0/angular-jwt';

import { environment } from '../../../environments/environment';
import { LoginComponent } from './login/login.component';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';

// token getter
export function tokenGetter() {
  return localStorage.getItem(environment.jwt.tokenKey);
}

@NgModule({
  declarations: [
    LoginComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    JwtModule.forRoot({
      config: {
        authScheme: 'bearer ',
        tokenGetter: tokenGetter,
        skipWhenExpired: true,
        whitelistedDomains: environment.jwt.whitelistedDomains,
        blacklistedRoutes: environment.jwt.blacklistedRoutes
      }
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
