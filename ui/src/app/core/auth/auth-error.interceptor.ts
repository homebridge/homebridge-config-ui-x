import { HttpErrorResponse, HttpInterceptor, HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http'
import { inject } from '@angular/core'
import { Router } from '@angular/router'
import { catchError } from 'rxjs/operators'
import { throwError } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { environment } from '@/environments/environment'

/**
 * HTTP Interceptor that handles authentication errors globally
 * Redirects users to login screen when receiving 401 responses
 */
export const authErrorInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const $auth = inject(AuthService)
  const $router = inject(Router)

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        // Token is no longer valid, clear auth state and redirect to login
        console.warn('Authentication expired, redirecting to login')
        $auth.token = null
        $auth.user = {}
        window.localStorage.removeItem(environment.jwt.tokenKey) // Direct removal to avoid reload
        
        // Store current route for redirect after login
        const currentRoute = window.location.pathname + window.location.search
        if (currentRoute !== '/login') {
          window.sessionStorage.setItem('target_route', currentRoute)
        }
        
        // Redirect to login immediately
        $router.navigate(['/login'])
      }
      
      return throwError(() => error)
    })
  )
}