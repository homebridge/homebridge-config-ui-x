import type {
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http'
import type { Observable } from 'rxjs'

import { HttpErrorResponse } from '@angular/common/http'
import { inject, Injector } from '@angular/core'
import { catchError, throwError } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'

const SKIP_PATHS = [
  '/auth/login',
  '/auth/noauth',
  '/auth/check',
  '/auth/refresh',
]

function shouldSkip(url: string): boolean {
  return SKIP_PATHS.some(path => url.includes(path))
}

/**
 * Forces a clean logout (which reloads back to /login through the existing
 * AuthService.logout flow) whenever any HTTP request returns 401 from an
 * endpoint that should have been authorised. Pre-fix, only `checkToken()`
 * reacted to server-side invalidation; every other call surfaced 401 as a
 * generic error toast and the user kept clicking buttons that no longer
 * worked.
 *
 * Login / noauth / check are skipped because those legitimately 401 in
 * non-bug paths (wrong password, missing setup wizard, deliberate token
 * probe).
 *
 * Refresh is skipped for a different reason: it is the one endpoint that
 * refuses a token the guard still accepts. `validateUser()` never looks at
 * `sessionStartedAt`, so a token past the 30-day renewal cap authorises
 * normally and only `refreshToken()` rejects it - at which point this
 * interceptor would call the ACCOUNT-WIDE logout holding a token the server
 * honours, and one device reaching the cap would sign the user out
 * everywhere (#2981). Every reason a refresh is refused is a reason to sign
 * out this browser alone, so `refreshSession()` owns that decision and asks
 * for a local logout itself.
 *
 * AuthService is resolved lazily through an `Injector` rather than via a
 * top-level `inject(AuthService)`. Eager injection here creates a cycle:
 * AuthService depends on SettingsService / ApiService, both of which use
 * HttpClient, which runs through this interceptor — Angular detects
 * `AuthService → ... → AuthService` at construction time and throws
 * NG0200. Capturing the `Injector` and resolving inside `catchError`
 * defers the lookup until after the DI graph has settled.
 */
export const authErrorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const injector = inject(Injector)

  return next(req).pipe(
    catchError((error) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !shouldSkip(req.url)) {
        const auth = injector.get(AuthService)
        if (auth.token) {
          auth.logout()
        }
      }
      return throwError(() => error)
    }),
  )
}
