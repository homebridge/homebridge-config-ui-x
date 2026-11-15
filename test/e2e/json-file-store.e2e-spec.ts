import { chmod, lstat, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { JsonFileStoreService } from '../../src/core/fs/json-file-store.service.js'

// Lets one test make the write into the temp file fail, as a full disk would
const openHook = vi.hoisted(() => ({ failWrite: false }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      if (openHook.failWrite) {
        handle.writeFile = () => Promise.reject(new Error('ENOSPC'))
      }
      return handle
    },
  }
})

describe('JsonFileStoreService', () => {
  let store: JsonFileStoreService
  let workDir: string

  beforeEach(async () => {
    store = new JsonFileStoreService()
    workDir = await mkdtemp(join(tmpdir(), 'jsonfilestore-'))
  })

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  it('mutate serialises concurrent calls on the same path', async () => {
    // Two parallel reads of the same baseline would each return the
    // unmutated file and the second write would clobber the first key.
    // The per-path mutex must serialise the read-modify-write cycle so
    // both increments land.
    const path = join(workDir, 'counter.json')
    await writeFile(path, JSON.stringify({ count: 0 }))

    await Promise.all([
      store.mutate<{ count: number }>(path, current => ({ count: (current?.count ?? 0) + 1 })),
      store.mutate<{ count: number }>(path, current => ({ count: (current?.count ?? 0) + 1 })),
    ])

    const final = JSON.parse(await readFile(path, 'utf8'))
    expect(final.count).toBe(2)
  })

  it('mutate locks are scoped per-path — independent files run in parallel', async () => {
    const pathA = join(workDir, 'a.json')
    const pathB = join(workDir, 'b.json')
    await writeFile(pathA, JSON.stringify({ v: 'a0' }))
    await writeFile(pathB, JSON.stringify({ v: 'b0' }))

    // If the locks were global rather than per-path, the slow A mutator
    // would block the fast B mutator from finishing. With per-path locks
    // both run in parallel and B resolves first despite being scheduled
    // second.
    const order: string[] = []
    await Promise.all([
      store.mutate<{ v: string }>(pathA, async () => {
        await new Promise(r => setTimeout(r, 60))
        order.push('a')
        return { v: 'a1' }
      }),
      store.mutate<{ v: string }>(pathB, async () => {
        await new Promise(r => setTimeout(r, 10))
        order.push('b')
        return { v: 'b1' }
      }),
    ])
    expect(order).toEqual(['b', 'a'])
  })

  it('mutate tolerates ENOENT — first-time writes pass `null` to the mutator', async () => {
    const path = join(workDir, 'fresh.json')
    const observed: any[] = []
    await store.mutate<{ created: boolean }>(path, (current) => {
      observed.push(current)
      return { created: true }
    })

    expect(observed).toEqual([null])
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ created: true })
  })

  it('mutate returning null/undefined skips the write', async () => {
    const path = join(workDir, 'skip.json')
    await writeFile(path, JSON.stringify({ original: true }))
    const before = await readFile(path, 'utf8')

    await store.mutate(path, () => null)
    await store.mutate(path, () => undefined)

    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('mutate releases the lock when the mutator throws so later writers can run', async () => {
    const path = join(workDir, 'throws.json')
    await writeFile(path, JSON.stringify({ count: 0 }))

    await expect(store.mutate(path, () => {
      throw new Error('boom')
    })).rejects.toThrow('boom')

    // If the lock leaked, this second mutate would deadlock the test.
    await store.mutate<{ count: number }>(path, current => ({ count: (current?.count ?? 0) + 1 }))
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ count: 1 })
  })

  it('write uses atomic temp-rename — no tmp leftovers after a successful write', async () => {
    const path = join(workDir, 'atomic.json')
    await store.write(path, { hello: 'world' })

    const entries = await readdir(workDir)
    expect(entries.filter(e => e.startsWith('atomic.json.tmp'))).toHaveLength(0)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ hello: 'world' })
  })

  it('a write that fails while writing the temp file removes it', async () => {
    const path = join(workDir, 'atomic.json')
    await writeFile(path, JSON.stringify({ generation: 1 }))
    openHook.failWrite = true
    try {
      await expect(store.write(path, { generation: 2 })).rejects.toThrow('ENOSPC')
    } finally {
      openHook.failWrite = false
    }

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ generation: 1 })
    expect((await readdir(workDir)).filter(e => e.includes('.tmp.'))).toHaveLength(0)
  })

  it.skipIf(process.platform === 'win32')('keeps the mode of an existing file', async () => {
    const path = join(workDir, 'auth.json')
    await writeFile(path, '[]')
    await chmod(path, 0o600)

    await store.write(path, [
      { username: 'admin' },
    ])

    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it.skipIf(process.platform === 'win32')('creates a new file with the mode asked for', async () => {
    const path = join(workDir, 'secret.json')

    await store.write(path, { secretKey: 'x' }, { mode: 0o600 })

    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it.skipIf(process.platform === 'win32')('writes through a symlink and keeps the link', async () => {
    const real = join(workDir, 'real-config.json')
    const link = join(workDir, 'config.json')
    await writeFile(real, '{}')
    await symlink(real, link)

    await store.write(link, {
      bridge: { name: 'x' },
    })

    expect((await lstat(link)).isSymbolicLink()).toBe(true)
    expect(JSON.parse(await readFile(real, 'utf8'))).toEqual({
      bridge: { name: 'x' },
    })
  })

  it('write honours backupTo by copying the existing file before the rename', async () => {
    const path = join(workDir, 'live.json')
    const backupPath = join(workDir, 'live.backup.json')
    await writeFile(path, JSON.stringify({ generation: 1 }))

    await store.write(path, { generation: 2 }, { backupTo: backupPath })

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ generation: 2 })
    expect(JSON.parse(await readFile(backupPath, 'utf8'))).toEqual({ generation: 1 })
  })

  it('write with backupTo tolerates a missing source file', async () => {
    const path = join(workDir, 'first-write.json')
    const backupPath = join(workDir, 'first-write.backup.json')
    // Source doesn't exist — backupTo should be a no-op rather than an error.
    await store.write(path, { generation: 1 }, { backupTo: backupPath })
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ generation: 1 })
  })
})
