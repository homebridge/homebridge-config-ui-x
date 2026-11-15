import { chmod, lstat, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readConfigForCheck, writeConfigAtomically } from '../../src/bin/config-file.js'

// Root can read a file with mode 000, so the "can't read it" case only shows for a normal user
const canTestUnreadable = process.platform !== 'win32' && process.getuid?.() !== 0

describe('hb-service config.json check', () => {
  let dir: string
  let path: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hb-config-check-'))
    path = join(dir, 'config.json')
  })

  afterEach(async () => {
    await chmod(path, 0o644).catch(() => undefined)
    await rm(dir, { recursive: true, force: true })
  })

  it('reads a good config', async () => {
    await writeFile(path, JSON.stringify({
      bridge: { username: '0E:11:22:33:44:55' },
    }))
    expect(await readConfigForCheck(path)).toEqual({
      bridge: { username: '0E:11:22:33:44:55' },
    })
  })

  it('reads a good config that starts with a byte order mark, as Windows Notepad saves it', async () => {
    // Regression: plain JSON.parse refused it, so hb-service replaced a valid config (new bridge username and
    // pin), which Homebridge itself reads fine
    await writeFile(path, `\uFEFF${JSON.stringify({
      bridge: { username: '0E:11:22:33:44:55' },
    })}`)
    expect(await readConfigForCheck(path)).toEqual({
      bridge: { username: '0E:11:22:33:44:55' },
    })
  })

  it.each([
    ['broken json', '{ "bridge": '],
    ['a list', '[]'],
    ['a text', '"x"'],
    ['null', 'null'],
  ])(
    'reports %s as broken, so it is replaced',
    async (_label, body) => {
      await writeFile(path, body)
      expect(await readConfigForCheck(path)).toBeUndefined()
    },
  )

  it.skipIf(!canTestUnreadable)('throws for a good file it may not read, so it is never replaced', async () => {
    await writeFile(path, JSON.stringify({
      bridge: { username: '0E:11:22:33:44:55' },
    }))
    await chmod(path, 0o000)
    await expect(readConfigForCheck(path)).rejects.toMatchObject({ code: 'EACCES' })
  })

  it.skipIf(process.platform === 'win32')('writes through a temp file, keeping the mode and a symlink', async () => {
    const real = join(dir, 'real.json')
    await writeFile(real, '{}')
    await chmod(real, 0o600)
    await symlink(real, path)

    await writeConfigAtomically(path, {
      bridge: { name: 'x' },
    })

    expect((await lstat(path)).isSymbolicLink()).toBe(true)
    expect(JSON.parse(await readFile(real, 'utf8'))).toEqual({
      bridge: { name: 'x' },
    })
    expect((await stat(real)).mode & 0o777).toBe(0o600)
    expect((await readdir(dir)).filter(f => f.includes('.tmp.'))).toHaveLength(0)
  })
})
