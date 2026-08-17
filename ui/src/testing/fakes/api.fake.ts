import type { Mock } from 'vitest'

import { vi } from 'vitest'

export type ApiMethod = 'delete' | 'get' | 'patch' | 'post' | 'put'

/**
 * One recorded call. `options` is recorded because four of the destructive
 * modals send their payload as `delete(url, { body })` rather than in a body
 * argument, and that is easy to break without noticing.
 */
export interface FakeApiCall {
  method: ApiMethod
  url: string
  body?: any
  options?: Record<string, any>
}

type Responder = (call: FakeApiCall) => any

interface Route {
  method: ApiMethod
  matcher: RegExp | string
  responder: Responder
  rejects: boolean
}

export interface FakeApiOptions {
  /**
   * Reject calls that have no registered response instead of resolving
   * `undefined`. Useful for a spec that wants to prove nothing else is
   * requested; off by default so background fetches a component makes but the
   * test does not care about stay harmless.
   */
  strict?: boolean
}

export interface FakeApi {
  get: Mock<(url: string, options?: Record<string, any>) => Promise<any>>
  post: Mock<(url: string, body?: any, options?: Record<string, any>) => Promise<any>>
  put: Mock<(url: string, body?: any, options?: Record<string, any>) => Promise<any>>
  patch: Mock<(url: string, body?: any, options?: Record<string, any>) => Promise<any>>
  delete: Mock<(url: string, options?: Record<string, any>) => Promise<any>>

  /** Every call made, in order. */
  calls: FakeApiCall[]

  /**
   * Register the response for a request. A later registration for the same
   * method and url wins, so a spec can override a shared default.
   * @param method - the http verb
   * @param url - exact url, or a regular expression to match it
   * @param response - the value to resolve with, or a function returning it
   */
  respond: (method: ApiMethod, url: RegExp | string, response: Responder | any) => FakeApi

  /**
   * Register a failure for a request.
   * @param method - the http verb
   * @param url - exact url, or a regular expression to match it
   * @param error - the value to reject with
   */
  fail: (method: ApiMethod, url: RegExp | string, error: any) => FakeApi

  /**
   * Every call matching a verb and url.
   * @param method - the http verb
   * @param url - exact url, or a regular expression to match it
   */
  callsTo: (method: ApiMethod, url?: RegExp | string) => FakeApiCall[]

  /**
   * The most recent call matching a verb and url, or undefined.
   * @param method - the http verb
   * @param url - exact url, or a regular expression to match it
   */
  lastCall: (method: ApiMethod, url?: RegExp | string) => FakeApiCall | undefined

  /** Forget every recorded call, keeping the registered responses. */
  clearCalls: () => void
}

function matches(matcher: RegExp | string, url: string): boolean {
  return typeof matcher === 'string' ? matcher === url : matcher.test(url)
}

/**
 * A stand-in for ApiService.
 *
 * Every component in the app reaches the server through the five promise
 * methods on ApiService, so a plain object replaces the whole HTTP stack:
 *
 *     const api = fakeApi().respond('get', '/plugins', [makePlugin()])
 *     TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] })
 * @param options - see FakeApiOptions
 */
export function fakeApi(options: FakeApiOptions = {}): FakeApi {
  const routes: Route[] = []
  const calls: FakeApiCall[] = []

  const findRoute = (call: FakeApiCall): Route | undefined => {
    for (let i = routes.length - 1; i >= 0; i -= 1) {
      if (routes[i].method === call.method && matches(routes[i].matcher, call.url)) {
        return routes[i]
      }
    }
    return undefined
  }

  const handle = (call: FakeApiCall): Promise<any> => {
    calls.push(call)
    const route = findRoute(call)
    if (!route) {
      if (options.strict) {
        return Promise.reject(new Error(`fakeApi: no response registered for ${call.method.toUpperCase()} ${call.url}`))
      }
      return Promise.resolve(undefined)
    }
    try {
      const value = route.responder(call)
      return route.rejects ? Promise.reject(value) : Promise.resolve(value)
    } catch (error) {
      return Promise.reject(error)
    }
  }

  const api = {
    get: vi.fn((url: string, opts?: Record<string, any>) => handle({ method: 'get', url, options: opts })),
    post: vi.fn((url: string, body?: any, opts?: Record<string, any>) => handle({ method: 'post', url, body, options: opts })),
    put: vi.fn((url: string, body?: any, opts?: Record<string, any>) => handle({ method: 'put', url, body, options: opts })),
    patch: vi.fn((url: string, body?: any, opts?: Record<string, any>) => handle({ method: 'patch', url, body, options: opts })),
    delete: vi.fn((url: string, opts?: Record<string, any>) => handle({ method: 'delete', url, options: opts })),
    calls,
  } as FakeApi

  const register = (method: ApiMethod, url: RegExp | string, response: any, rejects: boolean) => {
    const responder: Responder = typeof response === 'function' ? response : () => response
    routes.push({ method, matcher: url, responder, rejects })
    return api
  }

  api.respond = (method, url, response) => register(method, url, response, false)
  api.fail = (method, url, error) => register(method, url, error, true)

  api.callsTo = (method, url) => calls.filter(call => call.method === method && (url === undefined || matches(url, call.url)))
  api.lastCall = (method, url) => api.callsTo(method, url).at(-1)

  api.clearCalls = () => {
    calls.length = 0
    api.get.mockClear()
    api.post.mockClear()
    api.put.mockClear()
    api.patch.mockClear()
    api.delete.mockClear()
  }

  return api
}
