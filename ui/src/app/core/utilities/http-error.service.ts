import { inject, Injectable } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'

@Injectable({
  providedIn: 'root',
})
export class HttpErrorService {
  private $translate = inject(TranslateService)

  /**
   * Build a user-facing toast message for a caught error.
   *
   * One rule across the whole app: surface a server-supplied
   * `error.error.message` when the backend provided one (these are
   * short, contextual strings — e.g. "Username already taken",
   * "Plugin not found" — that the user actually benefits from). Every
   * other case (HttpErrorResponse without a server message, locally
   * thrown Error with a developer-oriented `.message`, anything else)
   * collapses onto the same translated generic key so the UI never
   * leaks Angular's auto-generated HTTP string ("Http failure response
   * for /api/users: 500 Internal Server Error", always English),
   * never leaks internal API paths, and never surfaces developer-only
   * thrown strings like "LevelControl cluster not found".
   *
   * Callers should still log the raw error to console for debugging.
   */
  public toToastMessage(err: unknown): string {
    const candidate = err as { error?: { message?: unknown } } | null
    const serverMessage = candidate?.error?.message
    if (typeof serverMessage === 'string' && serverMessage.trim().length > 0) {
      return serverMessage
    }
    return this.$translate.instant('toast.api_error_generic')
  }
}
