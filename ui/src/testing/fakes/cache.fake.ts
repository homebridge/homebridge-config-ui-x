import type { Mock } from 'vitest'

import { vi } from 'vitest'

export interface FakeCache<T = any> {
  get: Mock<() => Promise<T | undefined>>
  invalidate: Mock<() => void>

  /**
   * Change what the next `get()` resolves with.
   * @param next - the new cached value
   */
  setValue: (next: T) => void
}

/**
 * A stand-in for any of the five cache wrapper services (plugins, server
 * pairings, cached accessories, accessory overview, token). They all reduce
 * to the same two methods, so one stub covers them.
 * @param value - what `get()` resolves with
 */
export function cacheStub<T = any>(value?: T): FakeCache<T> {
  let current = value

  return {
    get: vi.fn(async () => current),
    invalidate: vi.fn(),
    setValue: (next: T) => {
      current = next
    },
  }
}

/**
 * A stand-in for CachedAccessoriesCacheService, which has two getters rather
 * than one.
 * @param hap - what `getHap()` resolves with
 * @param matter - what `getMatter()` resolves with
 */
export function cachedAccessoriesStub(hap: any = [], matter: any = []) {
  return {
    getHap: vi.fn(async () => hap),
    getMatter: vi.fn(async () => matter),
    invalidate: vi.fn(),
    invalidateHap: vi.fn(),
    invalidateMatter: vi.fn(),
  }
}

/**
 * A pass-through stand-in for TtlCacheService: every `get` runs its loader.
 *
 * Use this where the service under test caches through TtlCacheService itself
 * (ChildBridgesService, the wrappers) and the spec is about the loader, not
 * the caching. For the caching rules themselves, test the real service.
 */
export function ttlCacheStub() {
  return {
    get: vi.fn((_key: string, loader: () => Promise<any>) => loader()),
    invalidate: vi.fn(),
    invalidateAll: vi.fn(),
  }
}
