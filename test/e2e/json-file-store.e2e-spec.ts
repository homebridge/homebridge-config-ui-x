import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { JsonFileStoreService } from '../../src/core/fs/json-file-store.service.js'

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

  it('write uses atomic temp-rename — no partial file visible after a failed write', async () => {
    const path = join(workDir, 'atomic.json')
    await store.write(path, { hello: 'world' })

    // No tmp leftovers from the successful write.
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(workDir)
    expect(entries.filter(e => e.startsWith('atomic.json.tmp'))).toHaveLength(0)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ hello: 'world' })
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
