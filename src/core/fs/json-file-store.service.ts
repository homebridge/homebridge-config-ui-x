import { randomBytes } from 'node:crypto'
import { copyFile, open, rename, unlink } from 'node:fs/promises'
import { isAbsolute, normalize } from 'node:path'
import { pid } from 'node:process'

import { Injectable } from '@nestjs/common'
import { readJson } from 'fs-extra/esm'

/**
 * Defence-in-depth path guard for fs sinks. All call sites already
 * pass trusted, pre-resolved paths (config.json, auth.json, etc.),
 * but rejecting any path that contains a `..` traversal segment or
 * isn't already in normalised absolute form means a future caller
 * can't accidentally land user-controlled text in a fs call here.
 */
function assertSafeFsPath(path: string): void {
  if (typeof path !== 'string' || path.length === 0) {
    throw new TypeError('Path must be a non-empty string')
  }
  if (!isAbsolute(path) || normalize(path) !== path) {
    throw new Error('Refusing fs operation on non-normalised or relative path')
  }
}

export interface JsonWriteOptions {
  /**
   * Indentation passed to JSON.stringify. Defaults to 4 to match the
   * historical fs-extra writeJson default used across this codebase.
   */
  spaces?: number
  /**
   * If set, copyFile the current contents of `path` to this location
   * before writing the new value. Used by config.json's per-save
   * rotating backup. Missing source files (first-time writes) are
   * silently tolerated.
   */
  backupTo?: string
}

/**
 * Per-path mutex + atomic write-temp/fsync/rename for JSON file
 * mutations.
 *
 * Two failure modes this closes:
 *
 * 1. Concurrent read-modify-write of the same file (config.json,
 *    auth.json, accessory-layout.json, cached accessory files) would
 *    race: both callers would load the same baseline, both write, and
 *    the second write would wipe the first. The `mutate()` API holds
 *    an in-process async lock for the whole read-and-write cycle so
 *    only one in-flight call ever sees a given baseline.
 * 2. fs-extra's `writeJson` / `writeJsonSync` family open-truncate-
 *    then-write the target path; a crash mid-write leaves a partial
 *    file. The internal `atomicWrite` here streams to
 *    `${path}.tmp.<pid>.<rand>`, fsyncs it, then renames over the
 *    target. POSIX rename is atomic on the same filesystem so readers
 *    always see either the previous full file or the new full file.
 *
 * Locks are scoped per `path` (a Map keyed by the path string), so
 * unrelated files don't serialise against each other.
 */
@Injectable()
export class JsonFileStoreService {
  private readonly locks = new Map<string, Promise<unknown>>()

  /**
   * Lock-free snapshot read. Callers that don't need to write back
   * (e.g. `getConfigFile`) can keep using this directly.
   */
  async read<T>(path: string): Promise<T> {
    return readJson(path)
  }

  /**
   * Read-modify-write under the per-path lock. The mutator receives
   * the current parsed JSON (or `null` if the file doesn't yet exist)
   * and must return the value to persist. Returning `null` or
   * `undefined` skips the write.
   *
   * The mutator may throw — the lock is still released, and the
   * exception propagates to the caller.
   */
  async mutate<T>(
    path: string,
    mutator: (current: T | null) => T | null | undefined | Promise<T | null | undefined>,
    opts: JsonWriteOptions = {},
  ): Promise<T | null | undefined> {
    return this.withLock(path, async () => {
      let current: T | null = null
      try {
        current = await readJson(path) as T
      } catch (e: any) {
        if (e?.code !== 'ENOENT') {
          throw e
        }
      }
      const next = await mutator(current)
      if (next !== null && next !== undefined) {
        await this.atomicWrite(path, next, opts)
      }
      return next
    })
  }

  /**
   * Atomic write under the per-path lock. Use when the caller already
   * has the full value to persist (no read-modify-write needed).
   */
  async write<T>(path: string, data: T, opts: JsonWriteOptions = {}): Promise<void> {
    return this.withLock(path, () => this.atomicWrite(path, data, opts))
  }

  private async withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(path) ?? Promise.resolve()
    // `then(fn, fn)` runs the new work whether the previous chain
    // resolved or rejected — we don't want one failed write to
    // permanently poison the lock chain for unrelated callers.
    const guarded = previous.then(fn, fn)
    // The Map stores an error-swallowed version so the next waiter
    // doesn't inherit our rejection — they get a fresh chance to run.
    const swallowed = guarded.catch(() => undefined as T)
    this.locks.set(path, swallowed)
    try {
      return await guarded
    } finally {
      if (this.locks.get(path) === swallowed) {
        this.locks.delete(path)
      }
    }
  }

  private async atomicWrite<T>(path: string, data: T, opts: JsonWriteOptions): Promise<void> {
    assertSafeFsPath(path)
    if (opts.backupTo) {
      assertSafeFsPath(opts.backupTo)
      try {
        await copyFile(path, opts.backupTo)
      } catch (e: any) {
        if (e?.code !== 'ENOENT') {
          throw e
        }
      }
    }
    const tmpPath = `${path}.tmp.${pid}.${randomBytes(6).toString('hex')}`
    const body = `${JSON.stringify(data, null, opts.spaces ?? 4)}\n`
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      handle = await open(tmpPath, 'w')
      await handle.writeFile(body, 'utf8')
      await handle.sync()
    } finally {
      await handle?.close()
    }
    try {
      await rename(tmpPath, path)
    } catch (e) {
      await unlink(tmpPath).catch(() => undefined)
      throw e
    }
  }
}
