/* eslint-disable dot-notation -- Access private installer helpers without widening the production API. */
import type { HomebridgeServiceHelper } from '../../src/bin/hb-service.js'

import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { userInfo } from 'node:os'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DarwinInstaller } from '../../src/bin/platforms/darwin.js'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(() => {
    throw new Error('Unexpected shell command')
  }),
}))

// DarwinInstaller is also tested by the Linux and Windows CI jobs.
vi.mock('node:process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:process')>()
  return {
    default: {
      ...actual.default,
      getuid: vi.fn(() => 0),
    },
  }
})

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    userInfo: vi.fn(() => ({ uid: 502, gid: 21 })),
  }
})

describe('DarwinInstaller npm paths', () => {
  const prefix = '/Library/Application Support/Homebridge/node-26'
  const globalPath = `${prefix}/lib/node_modules`
  const binPath = `${prefix}/bin`
  const command = vi.mocked(execFileSync)
  let installer: DarwinInstaller
  let logger: Record<'error' | 'success' | 'warn', ReturnType<typeof vi.fn>>

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('SUDO_USER', '')
    vi.stubEnv('HOMEBRIDGE_MACOS_PACKAGE', '')
    logger = {
      error: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
    }
    installer = new DarwinInstaller({ asUser: '_homebridge', logger } as unknown as HomebridgeServiceHelper)
    installer['user'] = '_homebridge'
    vi.spyOn(process, 'getuid').mockReturnValue(0)
    command.mockImplementation((file, args) => {
      if (file === 'npm') {
        return `${prefix}\n`
      }
      if (file === '/usr/bin/which') {
        return `${binPath}/npm\n`
      }
      if (file === 'id') {
        return Buffer.from(args[0] === '-u'
          ? '501\n'
          : '20\n')
      }
      return Buffer.from('')
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('checks both space-containing paths using the selected uid and gid', async () => {
    await installer['checkGlobalNpmAccess']()
    expect(command).toHaveBeenCalledWith('id', ['-u', '_homebridge'])
    expect(command).toHaveBeenCalledWith('id', ['-g', '_homebridge'])
    expect(command).toHaveBeenCalledWith('/bin/test', ['-w', globalPath], { uid: 501, gid: 20 })
    expect(command).toHaveBeenCalledWith('/bin/test', ['-w', binPath], { uid: 501, gid: 20 })
    expect(command.mock.calls.some(([file]) => file === '/usr/sbin/chown')).toBe(false)
  })

  it('uses SUDO_USER when no explicit service user was selected', async () => {
    installer.hbService.asUser = undefined
    vi.stubEnv('SUDO_USER', 'service user')
    expect(await installer.getId()).toEqual({ uid: 501, gid: 20 })
    expect(command).toHaveBeenCalledWith('id', ['-u', 'service user'])
    expect(command).toHaveBeenCalledWith('id', ['-g', 'service user'])
  })

  it('uses the current user identity when no service user is selected', async () => {
    installer.hbService.asUser = undefined
    vi.mocked(userInfo).mockReturnValue({ uid: 502, gid: 21 } as ReturnType<typeof userInfo>)
    expect(await installer.getId()).toEqual({ uid: 502, gid: 21 })
    expect(command).not.toHaveBeenCalled()
  })

  it('queries the global prefix with npm notifications disabled', () => {
    vi.stubEnv('npm_config_loglevel', 'verbose')
    vi.stubEnv('npm_update_notifier', 'true')
    expect(installer['getGlobalNpmPath']()).toBe(globalPath)
    expect(command).toHaveBeenCalledWith('npm', ['-g', 'prefix'], {
      encoding: 'utf8',
      env: { ...process.env, npm_config_loglevel: 'silent', npm_update_notifier: 'false' },
    })
  })

  it('rebuilds the UI and global plugins using unsplit working directories', async () => {
    vi.stubEnv('UIX_BASE_PATH', `${globalPath}/homebridge-config-ui-x`)
    const normal = command.getMockImplementation()!
    command.mockImplementation((file, args, options) => file === 'node'
      ? Buffer.from('v24.17.0\n')
      : normal(file, args, options))
    await installer.rebuild(true)
    expect(command).toHaveBeenCalledWith('node', ['-v'])
    expect(command).toHaveBeenCalledWith('npm', ['rebuild'], { cwd: process.env.UIX_BASE_PATH, stdio: 'inherit' })
    expect(command).toHaveBeenCalledWith('npm', ['rebuild'], { cwd: globalPath, stdio: 'inherit' })
    expect(command).toHaveBeenCalledWith('/usr/sbin/chown', ['-R', '_homebridge:admin', binPath])
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('looks up a listening process without shell redirection', () => {
    command.mockReturnValue(Buffer.from('1234\n'))
    expect(installer.getPidOfPort(8581)).toBe('1234')
    expect(command).toHaveBeenCalledWith('lsof', [
      '-n',
      '-iTCP:8581',
      '-sTCP:LISTEN',
      '-t',
    ], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  })

  it('returns null if the listening process lookup fails', () => {
    command.mockImplementation(() => {
      throw new Error('No listener')
    })
    expect(installer.getPidOfPort(8581)).toBeNull()
  })

  it.each([globalPath, binPath])('repairs both directories when %s is unwritable', async (unwritable) => {
    const normal = command.getMockImplementation()!
    command.mockImplementation((file, args, options) => {
      if (file === '/bin/test' && args[1] === unwritable) {
        throw new Error('Permission denied')
      }
      return normal(file, args, options)
    })
    await installer['checkGlobalNpmAccess']()
    expect(command).toHaveBeenCalledWith('/usr/sbin/chown', ['-R', '_homebridge:admin', globalPath])
    expect(command).toHaveBeenCalledWith('/usr/sbin/chown', ['-R', '_homebridge:admin', binPath])
    expect(command.mock.calls.filter(([file]) => file === '/usr/bin/which')).toHaveLength(1)
  })

  it('skips ownership repair and executable lookup in package mode', async () => {
    vi.stubEnv('HOMEBRIDGE_MACOS_PACKAGE', '1')
    await installer['setNpmPermissions'](globalPath)
    expect(command).not.toHaveBeenCalled()
  })

  it('resolves the executable directory when repair is called directly', async () => {
    await installer['setNpmPermissions'](globalPath)
    expect(command).toHaveBeenCalledWith('/usr/bin/which', ['npm'], { encoding: 'utf8' })
    expect(command).toHaveBeenCalledWith('/usr/sbin/chown', ['-R', '_homebridge:admin', binPath])
  })

  it('prints quoted resolved paths and exits if ownership repair fails', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    command.mockImplementation(() => {
      throw new Error('Permission denied')
    })
    const apostrophePath = '/Library/Application Support/Homebridge/owner\'s/lib/node_modules'
    await expect(installer['setNpmPermissions'](apostrophePath, binPath)).rejects.toThrow('exit')
    expect(log).toHaveBeenCalledWith('sudo chown -R \'_homebridge:admin\' \'/Library/Application Support/Homebridge/owner\'\\\'\'s/lib/node_modules\'')
    expect(log).toHaveBeenCalledWith(`sudo chown -R '_homebridge:admin' '${binPath}'`)
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('does not have write access'))
  })

  it.each(['npm', '/usr/bin/which'])('propagates %s lookup failures without repairing ownership', async (failed) => {
    const normal = command.getMockImplementation()!
    command.mockImplementation((file, args, options) => {
      if (file === failed) {
        throw new Error('lookup failed')
      }
      return normal(file, args, options)
    })
    await expect(installer['checkGlobalNpmAccess']()).rejects.toThrow('lookup failed')
    expect(command.mock.calls.some(([file]) => file === '/usr/sbin/chown')).toBe(false)
  })

  it.each([
    ['npm', 'npm returned an empty global prefix'],
    ['/usr/bin/which', 'Could not resolve the npm executable'],
  ])('rejects empty output from %s before checking permissions', async (empty, message) => {
    const normal = command.getMockImplementation()!
    command.mockImplementation((file, args, options) => file === empty
      ? '\n'
      : normal(file, args, options))
    await expect(installer['checkGlobalNpmAccess']()).rejects.toThrow(message)
    expect(command.mock.calls.some(([file]) => file === '/bin/test' || file === '/usr/sbin/chown')).toBe(false)
  })
})
