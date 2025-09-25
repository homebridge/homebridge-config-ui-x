import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Router } from '@angular/router'
import { Observable, throwError } from 'rxjs'
import { catchError } from 'rxjs/operators'

import { AuthService } from '@/app/core/auth/auth.service'
import { environment } from '@/environments/environment'

/**
 * HTTP Interceptor that handles authentication errors globally
 * Redirects users to login screen when receiving 401 responses
 */
@Injectable()
export class AuthErrorInterceptor implements HttpInterceptor {
  constructor(
    private $auth: AuthService,
    private $router: Router,
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          // Token is no longer valid, clear auth state and redirect to login
          console.warn('Authentication expired, redirecting to login')
          this.$auth.token = null
          this.$auth.user = {}
          window.localStorage.removeItem(environment.jwt.tokenKey) // Direct removal to avoid reload

          // Store current route for redirect after login
          const currentRoute = window.location.pathname + window.location.search
          if (currentRoute !== '/login') {
            window.sessionStorage.setItem('target_route', currentRoute)
          }

          // Redirect to login immediately
          this.$router.navigate(['/login'])
        }

        return throwError(() => error)
      }),
    )
  }
}
