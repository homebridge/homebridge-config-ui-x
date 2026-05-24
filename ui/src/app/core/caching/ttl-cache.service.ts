import { Injectable } from '@angular/core'

interface CacheEntry<T> {
  expiresAt: number
  value: Promise<T>
}

const DEFAULT_TTL_MS = 30_000

@Injectable({
  providedIn: 'root',
})
export class TtlCacheService {
  private store = new Map<string, CacheEntry<unknown>>()

  public async get<T>(key: string, loader: () => Promise<T>, ttlMs: number = DEFAULT_TTL_MS): Promise<T> {
    const now = Date.now()
    const existing = this.store.get(key) as CacheEntry<T> | undefined

    if (existing && existing.expiresAt > now) {
      try {
        return await existing.value
      } catch {
        this.store.delete(key)
      }
    }

    const pending = loader()
    this.store.set(key, { value: pending, expiresAt: now + ttlMs })

    try {
      return await pending
    } catch (error) {
      this.store.delete(key)
      throw error
    }
  }

  public invalidate(key: string): void {
    this.store.delete(key)
  }

  public invalidateAll(): void {
    this.store.clear()
  }
}
