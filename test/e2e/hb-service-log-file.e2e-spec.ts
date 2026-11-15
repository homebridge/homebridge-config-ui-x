import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openLogFile } from '../../src/bin/log-file.js'

describe('the hb-service log file', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hb-log-'))
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
})
