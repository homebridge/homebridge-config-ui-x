import type { FakeAuth } from '@/testing'

import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { firstValueFrom } from 'rxjs'
import { beforeEach, describe, expect, it } from 'vitest'

import { authErrorInterceptor } from '@/app/core/auth/auth-error.interceptor'
import { AuthService } from '@/app/core/auth/auth.service'
import { makeAuth } from '@/testing'

/**
 * Before this interceptor existed only `checkToken()` reacted to the server
 * invalidating a session. Every other call surfaced a 401 as a generic toast
 * and the user carried on clicking buttons that no longer did anything.
 */
describe('authErrorInterceptor', () => {
  let auth: FakeAuth
  let http: HttpClient
  let httpMock: HttpTestingController

  beforeEach(() => {
    auth = makeAuth()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    })
    http = TestBed.inject(HttpClient)
    httpMock = TestBed.inject(HttpTestingController)
  })

  async function expectFailure(url: string, status: number): Promise<void> {
    const request = firstValueFrom(http.get(url))
    httpMock.expectOne(url).flush({}, { status, statusText: 'Error' })
    await expect(request).rejects.toBeDefined()
  }

  it('signs the user out when an authorised request is rejected', async () => {
    await expectFailure('/api/plugins', 401)

    expect(auth.logout).toHaveBeenCalledTimes(1)
  })

  it('still passes the error on to the caller', async () => {
    const request = firstValueFrom(http.get('/api/plugins'))
    httpMock.expectOne('/api/plugins').flush({ message: 'nope' }, { status: 401, statusText: 'Unauthorized' })

    // The caller's own error handling has to keep running, so the page can
    // show something while the reload happens
    await expect(request).rejects.toMatchObject({ status: 401 })
  })

  it.each([
    ['/api/auth/login'],
    ['/api/auth/noauth'],
    ['/api/auth/check'],
  ])('leaves %s alone', async (url) => {
    // These legitimately answer 401 - a wrong password is not a dead session
    await expectFailure(url, 401)

    expect(auth.logout).not.toHaveBeenCalled()
  })

  it('leaves /api/auth/refresh to decide its own logout', async () => {
    // ⚠️ #2981. This is the one endpoint that refuses a token the guard still
    // accepts - a token past the 30-day renewal cap. Logging out from here
    // would send the ACCOUNT-WIDE logout with a token the server honours, and
    // one device reaching the cap would sign the user out on every other
    // device. refreshSession() asks for a browser-local logout instead.
    await expectFailure('/api/auth/refresh', 401)

    expect(auth.logout).not.toHaveBeenCalled()
  })

  it('does nothing when there is no session to end', async () => {
    auth.token = null

    // Guards against a logout loop while the app is still starting up
    await expectFailure('/api/plugins', 401)

    expect(auth.logout).not.toHaveBeenCalled()
  })

  it.each([403, 404, 500])('ignores a %s', async (status) => {
    await expectFailure('/api/plugins', status)

    expect(auth.logout).not.toHaveBeenCalled()
  })
})
