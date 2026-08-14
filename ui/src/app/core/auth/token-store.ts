/**
 * In-memory holder for the access token.
 *
 * The token used to be kept in localStorage, which meant any script running on
 * the page could read it — and the token is a bearer credential that reaches
 * every admin API, including the terminal socket. It now lives here for the
 * lifetime of the page only, and is restored after a reload by exchanging the
 * HttpOnly `hb-refresh` cookie at POST /api/auth/session.
 *
 * A module-scope variable rather than a service because `tokenGetter` (used by
 * the JWT interceptor) is a plain function with no access to Angular DI.
 */
let accessToken: string | null = null

export function getStoredToken(): string | null {
  return accessToken
}

export function setStoredToken(token: string | null): void {
  accessToken = token
}
