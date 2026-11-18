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
import { environment } from '@/environments/environment'

const SKIP_PATHS = [
  '/auth/login',
  '/auth/noauth',
  '/auth/check',
  '/auth/refresh',
]

function shouldSkip(url: string): boolean {
  return !isOwnServer(url) || SKIP_PATHS.some(path => url.includes(path))
}

/**
 * A 401 only says something about our session when our own server sent it. Other sites (the weather widget's
 * OpenWeatherMap, for one, answers 401 for a bad API key) must never log the user out of every device.
 */
function isOwnServer(url: string): boolean {
  try {
    const target = new URL(url, window.location.href).origin
    return target === window.location.origin || target === new URL(environment.api.base, window.location.href).origin
  } catch {
    return true
  }
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
