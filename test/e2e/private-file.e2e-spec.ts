import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { writePrivateFile } from '../../src/core/fs/private-file.js'

const { modesAtWrite } = vi.hoisted(() => ({ modesAtWrite: [] as number[] }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...real,
    // Note the file's mode at the moment the secret is written into it
    writeFile: async (path: any, ...rest: any[]) => {
      modesAtWrite.push(await real.stat(path).then(s => s.mode & 0o777, () => -1))
      return (real.writeFile as any)(path, ...rest)
    },
  }
})

describe.skipIf(process.platform === 'win32')('writing a private file', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'private-file-'))
    modesAtWrite.length = 0
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('makes an existing file private before the secret goes into it', async () => {
    // Regression: the new key was written into the old 0644 file and only then made 0600, so for that moment
    // every user on the host could read it
    const path = join(dir, 'key.pem')
    await writeFile(path, 'old')
    await chmod(path, 0o644)
    modesAtWrite.length = 0

    await writePrivateFile(path, 'secret')

    expect(modesAtWrite).toEqual([0o600])
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it('creates a new file private', async () => {
    const path = join(dir, 'new.pem')

    await writePrivateFile(path, 'secret')

    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })
})
