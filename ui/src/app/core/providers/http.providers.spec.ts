import { HttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { tokenGetter } from '@/app/core/auth/token-getter'
import { getStoredToken, setStoredToken } from '@/app/core/auth/token-store'
import { provideAppHttpClient } from '@/app/core/providers/http.providers'
import { environment } from '@/environments/environment'

/**
 * How the access token gets onto outgoing requests.
 *
 * The token is a bearer credential for every admin API on the box, including
 * the terminal socket, so where it is and is not sent matters more than most
 * wiring:
 *
 * ⚠️ **the UI talks to third parties.** The weather widget fetches
 * `api.openweathermap.org` through the same `HttpClient`. The only thing that
 * stops the Homebridge admin token being sent to OpenWeatherMap with it is the
 * `allowedDomains` list in this provider — a mistake there is a credential
 * leak to a third party, and nothing in the UI would look wrong.
 *
 * ⚠️ **login must go out bare.** `/auth/login` is on `disallowedRoutes`. A
 * stale token on the login request is exactly the situation the user is trying
 * to get out of.
 */
describe('the http client wiring', () => {
  let http: HttpClient
  let controller: HttpTestingController

  /** A url on the homebridge api, built from the same config the app uses. */
  const apiUrl = (path: string) => `${environment.api.base}${path}`

  beforeEach(() => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      // Testing last, so its backend replaces the real one while the
      // interceptors under test still run
      providers: [provideAppHttpClient(), provideHttpClientTesting()],
    })

    http = TestBed.inject(HttpClient)
    controller = TestBed.inject(HttpTestingController)
    setStoredToken(null)
  })

  afterEach(() => {
    controller.verify()
    setStoredToken(null)
    window.localStorage.clear()
  })

  /**
   * Make a request and return the header it went out with.
   * @param url - where the request goes
   */
  function authorizationFor(url: string): string | null {
    http.get(url).subscribe({ next: () => {}, error: () => {} })
    const request = controller.expectOne(request => request.url === url)
    const header = request.request.headers.get('Authorization')
    request.flush({})
    return header
  }

  describe('a request to the homebridge api', () => {
    it('carries the stored token', () => {
      setStoredToken('a-real-token')

      expect(authorizationFor(apiUrl('/status/homebridge'))).toBe('bearer a-real-token')
    })

    it('uses a lowercase bearer scheme, which is what the server parses', () => {
      setStoredToken('a-real-token')

      expect(authorizationFor(apiUrl('/status/homebridge'))).toMatch(/^bearer /)
    })

    it('sends no authorization at all when there is no token', () => {
      // Not `bearer null` - the server would read that as a malformed token and
      // 401 rather than treating the request as anonymous
      expect(authorizationFor(apiUrl('/auth/settings'))).toBeNull()
    })

    it('picks the token up again once the user signs in', () => {
      // The token is set after the session exchange, not at bootstrap, so it has
      // to be read per request rather than captured once
      expect(authorizationFor(apiUrl('/status/homebridge'))).toBeNull()

      setStoredToken('signed-in-now')

      expect(authorizationFor(apiUrl('/status/homebridge'))).toBe('bearer signed-in-now')
    })
  })

  describe('a request that must go out bare', () => {
    it('leaves the token off the login request', () => {
      setStoredToken('an-old-token')

      expect(authorizationFor(apiUrl('/auth/login'))).toBeNull()
    })

    it('leaves the token off a third party api', () => {
      // The weather widget's url. A token sent here reaches someone else's server
      setStoredToken('a-real-token')

      expect(authorizationFor('https://api.openweathermap.org/data/2.5/weather')).toBeNull()
    })

    it('leaves the token off any other host', () => {
      setStoredToken('a-real-token')

      expect(authorizationFor('https://example.com/anything')).toBeNull()
    })
  })

  describe('the configuration this rests on', () => {
    it('allows the homebridge api host', () => {
      expect(environment.jwt.allowedDomains).toContain(`${new URL(environment.api.base).host}`)
    })

    it('names the login route as one to skip', () => {
      expect(environment.jwt.disallowedRoutes).toContain(apiUrl('/auth/login'))
    })
  })

  describe('the token getter the interceptor calls', () => {
    it('reads the token held in memory', () => {
      setStoredToken('in-memory')

      expect(tokenGetter()).toBe('in-memory')
    })

    it('reports nothing once the token is cleared', () => {
      setStoredToken('in-memory')
      setStoredToken(null)

      expect(tokenGetter()).toBeNull()
    })

    it('never falls back to local storage', () => {
      // Where the token used to live, and the reason it moved: anything running
      // on the page could read it there. A fallback would undo that quietly
      window.localStorage.setItem('access_token', 'left-over-from-an-old-version')
      setStoredToken(null)

      expect(tokenGetter()).toBeNull()
      expect(getStoredToken()).toBeNull()
    })
  })
})
