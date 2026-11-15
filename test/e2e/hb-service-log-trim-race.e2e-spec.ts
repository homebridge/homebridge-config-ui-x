import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { truncateLogFile } from '../../src/bin/log-file.js'

const { afterTruncate } = vi.hoisted(() => ({
  afterTruncate: { run: undefined as undefined | (() => Promise<void>) },
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...real,
    // Lets a test run a write at the exact moment just after the log was emptied
    open: async (...args: Parameters<typeof real.open>) => {
      const handle = await real.open(...args)
      const truncate = handle.truncate.bind(handle)
      handle.truncate = async (len?: number) => {
        await truncate(len)
        await afterTruncate.run?.()
      }
      return handle
    },
  }
})

describe('trimming the hb-service log while homebridge writes to it', () => {
  let dir: string
  let path: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hb-log-race-'))
    path = join(dir, 'homebridge.log')
  })

  afterEach(async () => {
    afterTruncate.run = undefined
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps a line that was on its way to the file whole', async () => {
    // Regression: the part kept was written at the start of the file, over a line that landed just after the
    // truncate, so that line lost its start ("ritten in flight")
    await writeFile(path, 'old1\nold2\nold3\n')
    afterTruncate.run = () => appendFile(path, 'NEW LINE written in flight\n')

    await truncateLogFile(path, 10, 10)

    const log = await readFile(path, 'utf8')
    expect(log).toContain('NEW LINE written in flight\n')
    expect(log).toContain('old3\n')
  })
})
