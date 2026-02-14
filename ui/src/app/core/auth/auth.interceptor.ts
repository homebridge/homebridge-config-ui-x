import { HttpErrorResponse, HttpHandlerFn, HttpRequest } from '@angular/common/http'
import { catchError, throwError } from 'rxjs'

import { environment } from '@/environments/environment'

/**
 * HTTP interceptor that catches 401 Unauthorized responses and triggers a logout.
 * This handles the case where a user's session has expired on the server
 * (e.g. they were away) but the client hasn't detected it yet.
 *
 * Note: We avoid injecting AuthService here to prevent a circular dependency
 * (HttpClient -> interceptor -> AuthService -> ApiService -> HttpClient).
 */
export function authInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  // Skip auth-related endpoints where 401 is expected (e.g. bad credentials)
  if (req.url.includes('/auth/login') || req.url.includes('/auth/noauth')) {
    return next(req)
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        window.localStorage.removeItem(environment.jwt.tokenKey)
        window.location.reload()
      }
      return throwError(() => error)
    }),
  )
}
