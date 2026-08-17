import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TtlCacheService } from '@/app/core/caching/ttl-cache.service'

describe('TtlCacheService', () => {
  let cache: TtlCacheService

  beforeEach(() => {
    vi.useFakeTimers()
    TestBed.configureTestingModule({})
    cache = TestBed.inject(TtlCacheService)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs the loader once and reuses the value while it is fresh', async () => {
    const loader = vi.fn(async () => 'accessories')

    await expect(cache.get('key', loader)).resolves.toBe('accessories')
    await expect(cache.get('key', loader)).resolves.toBe('accessories')

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight request between concurrent callers', async () => {
    // The pending promise is cached, not just the result, so the five modals
    // that all ask for the accessory overview on open trigger one request
    let resolveLoader: (value: string) => void = () => {}
    const loader = vi.fn(() => new Promise<string>((resolve) => {
      resolveLoader = resolve
    }))

    const first = cache.get('key', loader)
    const second = cache.get('key', loader)
    resolveLoader('pairings')

    await expect(Promise.all([first, second])).resolves.toEqual(['pairings', 'pairings'])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('reloads once the entry has expired', async () => {
    const loader = vi.fn(async () => 'plugins')

    await cache.get('key', loader, 30_000)
    vi.advanceTimersByTime(30_001)
    await cache.get('key', loader, 30_000)

    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('honours a custom lifetime', async () => {
    const loader = vi.fn(async () => 'plugins')

    await cache.get('key', loader, 1_000)
    vi.advanceTimersByTime(999)
    await cache.get('key', loader, 1_000)

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure', async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('recovered')

    await expect(cache.get('key', loader)).rejects.toThrow('offline')
    await expect(cache.get('key', loader)).resolves.toBe('recovered')

    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('drops one key without touching the others', async () => {
    const plugins = vi.fn(async () => 'plugins')
    const pairings = vi.fn(async () => 'pairings')

    await cache.get('plugins', plugins)
    await cache.get('pairings', pairings)
    cache.invalidate('plugins')
    await cache.get('plugins', plugins)
    await cache.get('pairings', pairings)

    expect(plugins).toHaveBeenCalledTimes(2)
    expect(pairings).toHaveBeenCalledTimes(1)
  })

  it('drops everything on invalidateAll', async () => {
    const plugins = vi.fn(async () => 'plugins')
    const pairings = vi.fn(async () => 'pairings')

    await cache.get('plugins', plugins)
    await cache.get('pairings', pairings)
    cache.invalidateAll()
    await cache.get('plugins', plugins)
    await cache.get('pairings', pairings)

    expect(plugins).toHaveBeenCalledTimes(2)
    expect(pairings).toHaveBeenCalledTimes(2)
  })
})
