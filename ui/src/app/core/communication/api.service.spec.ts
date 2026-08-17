import { HttpErrorResponse, provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiService } from '@/app/core/communication/api.service'
import { environment } from '@/environments/environment'

/**
 * ApiService is the only place the app talks to HttpClient, so these are the
 * assumptions every other spec's `fakeApi` stands in for: the base url is
 * prefixed, the body and options are passed straight through, and a failure
 * reaches the caller untouched.
 */
describe('ApiService', () => {
  const base = environment.api.base
  let service: ApiService
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
    service = TestBed.inject(ApiService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    http.verify()
  })

  it.each([
    ['get', () => service.get('/status')],
    ['delete', () => service.delete('/status')],
  ])('sends a %s to the api base', async (method, call) => {
    const result = call()
    const req = http.expectOne(`${base}/status`)

    expect(req.request.method).toBe(method.toUpperCase())
    req.flush({ ok: true })

    await expect(result).resolves.toEqual({ ok: true })
  })

  it.each([
    ['post', () => service.post('/users', { username: 'admin' })],
    ['put', () => service.put('/users', { username: 'admin' })],
    ['patch', () => service.patch('/users', { username: 'admin' })],
  ])('sends a %s with its body to the api base', async (method, call) => {
    const result = call()
    const req = http.expectOne(`${base}/users`)

    expect(req.request.method).toBe(method.toUpperCase())
    expect(req.request.body).toEqual({ username: 'admin' })
    req.flush({ id: 1 })

    await expect(result).resolves.toEqual({ id: 1 })
  })

  it('passes request options through to HttpClient', async () => {
    // The backup and log downloads rely on this reaching HttpClient intact
    const result = service.get('/backup/download', { observe: 'response', responseType: 'blob' })
    const req = http.expectOne(`${base}/backup/download`)

    expect(req.request.responseType).toBe('blob')
    req.flush(new Blob(['backup']))

    await expect(result).resolves.toBeDefined()
  })

  it('rejects with the error response untouched', async () => {
    // Every consumer's error path reads err.error.message off this, and
    // HttpErrorService decides what the user sees from the same shape
    const result = service.post('/users', {})
    http.expectOne(`${base}/users`).flush(
      { message: 'Username already taken' },
      { status: 409, statusText: 'Conflict' },
    )
    const error: HttpErrorResponse = await result.catch(err => err)

    expect(error).toBeInstanceOf(HttpErrorResponse)
    expect(error.status).toBe(409)
    expect(error.error).toEqual({ message: 'Username already taken' })
  })
})
