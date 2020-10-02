import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { JwtModule } from '@auth0/angular-jwt';
import { TranslateModule } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { LoginComponent } from './login/login.component';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';
import { LoginGuard } from './login/login.guard';

// token getter
export function tokenGetter() {
  return localStorage.getItem(environment.jwt.tokenKey);
}

@NgModule({
  declarations: [
    LoginComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    JwtModule.forRoot({
      config: {
        authScheme: 'bearer ',
        tokenGetter: tokenGetter,
        skipWhenExpired: true,
        allowedDomains: environment.jwt.allowedDomains,
        disallowedRoutes: environment.jwt.disallowedRoutes,
      },
    }),
  ],
  providers: [
    AuthService,
    AuthGuard,
    AdminGuard,
    LoginGuard,
  ],
  exports: [],
})
export class AuthModule { }
