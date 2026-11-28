import type { HomebridgeServiceHelper } from '../../src/bin/hb-service.js'

import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FreeBSDInstaller } from '../../src/bin/platforms/freebsd.js'

const { execSync } = vi.hoisted(() => ({
  execSync: vi.fn(),
}))

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execSync,
}))

describe('freeBSDInstaller', () => {
  const sudoUserBefore = process.env.SUDO_USER

  // Windows has no process.getuid, so there is nothing for the spy to replace there
  const hadGetuid = typeof process.getuid === 'function'

  beforeEach(() => {
    execSync.mockReset()
    if (!hadGetuid) {
      process.getuid = () => 0
    }
    vi.spyOn(process, 'getuid').mockReturnValue(0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (!hadGetuid) {
      delete process.getuid
    }
    if (sudoUserBefore === undefined) {
      delete process.env.SUDO_USER
    } else {
      process.env.SUDO_USER = sudoUserBefore
    }
  })

  it('installs for the user who ran sudo when no --user is given', async () => {
    process.env.SUDO_USER = 'bob'
    const hbService = {
      action: 'install',
      asUser: undefined,
      logger: {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      },
    } as unknown as HomebridgeServiceHelper
    const installer = new FreeBSDInstaller(hbService)

    ;(installer as any).checkForRoot()
    await (installer as any).checkUser()

    expect(hbService.asUser).toBe('bob')
    expect(execSync.mock.calls.map(([command]) => command).join('\n')).not.toContain('undefined')
    expect(execSync).toHaveBeenCalledWith(expect.stringContaining('id bob'))
  })
})
