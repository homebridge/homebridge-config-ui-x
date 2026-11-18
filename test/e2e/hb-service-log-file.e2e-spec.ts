import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openLogFile, truncateLogFile } from '../../src/bin/log-file.js'

describe('the hb-service log file', () => {
  let dir: string
  let path: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hb-log-'))
    path = join(dir, 'homebridge.log')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reports a log file it can not open, instead of an unhandled error that ends hb-service', async () => {
    const onError = vi.fn()
    const stream = openLogFile(join(dir, 'no-such-folder', 'homebridge.log'), onError)
    await new Promise(resolve => stream.once('close', resolve))
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'ENOENT' }))
  })

  it('keeps the newest part, from a whole line', async () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n')
    await writeFile(path, `${lines}\n`)

    expect(await truncateLogFile(path, 1000, 200)).toBe(true)

    const kept = await readFile(path, 'utf8')
    expect(kept.length).toBeLessThanOrEqual(200)
    expect(kept.startsWith('line ')).toBe(true)
    expect(kept.endsWith('line 999\n')).toBe(true)
    expect(kept).not.toContain('\0')
  })

  it('works when the size to keep is bigger than the size that starts a trim', async () => {
    // The settings page allows a maximum size of 100,000 with the default 200,000 to keep: a 150 kB log used to
    // fail every two hours with ERR_OUT_OF_RANGE and was never trimmed
    await writeFile(path, `${'x'.repeat(99)}\n`.repeat(1500))

    expect(await truncateLogFile(path, 100000, 200000)).toBe(true)
    expect((await stat(path)).size).toBeLessThanOrEqual(100000)
  })

  it('keeps the newest part for a maximum size of 0, instead of emptying the log', async () => {
    // Regression: the part kept was capped at the maximum, so `"maxSize": 0` emptied homebridge.log at every
    // start and every two hours
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
    await writeFile(path, `${lines}\n`)

    expect(await truncateLogFile(path, 0, 200)).toBe(true)

    const kept = await readFile(path, 'utf8')
    expect(kept.endsWith('line 99\n')).toBe(true)
    expect(kept.length).toBeGreaterThan(100)
  })

  it('leaves a log below the maximum size alone, and never trims when the maximum is negative', async () => {
    await writeFile(path, 'short\n')
    expect(await truncateLogFile(path, 1000, 200)).toBe(false)
    expect(await truncateLogFile(path, -1, 200)).toBe(false)
    expect(await readFile(path, 'utf8')).toBe('short\n')
  })
})
