import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { writeConfigAtomically } from '../../src/bin/config-file.js'

const { chown } = vi.hoisted(() => ({
  chown: vi.fn(async () => undefined),
}))

vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  chown,
}))

describe.skipIf(process.platform === 'win32')('hb-service saving config.json as root', () => {
  let dir: string
  let path: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hb-config-owner-'))
    path = join(dir, 'config.json')
    chown.mockClear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(dir, { recursive: true, force: true })
  })

  it('gives the new file back to the owner of the old one', async () => {
    // Regression: the temp file and rename kept the mode but not the owner, so `sudo hb-service install` on macOS
    // left config.json owned by root, which a service user can not read when it is 0600
    await writeFile(path, '{}')
    const { uid, gid } = await stat(path)
    vi.spyOn(process, 'getuid').mockReturnValue(0)

    await writeConfigAtomically(path, { bridge: {} })

    expect(chown).toHaveBeenCalledWith(expect.stringContaining(`${path}.tmp.`), uid, gid)
  })

  it('leaves the owner alone when not run as root', async () => {
    await writeFile(path, '{}')
    vi.spyOn(process, 'getuid').mockReturnValue(501)

    await writeConfigAtomically(path, { bridge: {} })

    expect(chown).not.toHaveBeenCalled()
  })
})
