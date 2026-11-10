import type { HomebridgeServiceHelper } from '../../src/bin/hb-service.js'

import { Buffer } from 'node:buffer'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LinuxInstaller } from '../../src/bin/platforms/linux.js'
import { getSignedByKeyring, parseDpkgOwner, setNodesourceMajorVersion } from '../../src/bin/platforms/nodesource.js'

// In-memory apt config, so these tests never touch the real system
const { files, execSync, execFileSync } = vi.hoisted(() => ({
  files: new Map<string, string>(),
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}))

const isAptPath = (path: unknown) => typeof path === 'string' && (path.startsWith('/etc/apt/') || path.startsWith('/usr/share/keyrings/') || path.startsWith('/etc/systemd/'))

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execSync,
  execFileSync,
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    chmod: vi.fn(async (path: string, mode: number) => isAptPath(path)
      ? undefined
      : actual.chmod(path, mode)),
    readFile: vi.fn(async (path: string, options: 'utf8') => isAptPath(path)
      ? files.get(path)
      : actual.readFile(path, options)),
    writeFile: vi.fn(async (path: string, data: string) => isAptPath(path)
      ? void files.set(path, data)
      : actual.writeFile(path, data)),
  }
})

vi.mock('fs-extra/esm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs-extra/esm')>()
  return {
    ...actual,
    copy: vi.fn(async (src: string, dest: string) => void files.set(dest, files.get(src) ?? '')),
    pathExists: vi.fn(async (path: string) => isAptPath(path)
      ? files.has(path)
      : actual.pathExists(path)),
    remove: vi.fn(async (path: string) => isAptPath(path)
      ? void files.delete(path)
      : actual.remove(path)),
  }
})

const LIST = '/etc/apt/sources.list.d/nodesource.list'
const SOURCES = '/etc/apt/sources.list.d/nodesource.sources'
const OLD_KEYRING = '/usr/share/keyrings/nodesource.gpg'
const CURRENT_KEYRING = '/etc/apt/keyrings/nodes'
const DEB822 = `Types: deb\nURIs: https://deb.nodesource.com/node_22.x\nSuites: nodistro\nComponents: main\nSigned-By: ${OLD_KEYRING}\n`

describe('LinuxInstaller update-node', () => {
  let installer: LinuxInstaller
  let logger: Record<'error' | 'log' | 'success' | 'warn', ReturnType<typeof vi.fn>>

  beforeEach(() => {
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
    }
    installer = new LinuxInstaller({ logger, serviceName: 'homebridge' } as unknown as HomebridgeServiceHelper)
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('points synology users to package center', async () => {
    vi.stubEnv('HOMEBRIDGE_SYNOLOGY_PACKAGE', '1')

    await expect(installer.updateNodejs({ target: '22.22.2', rebuild: false })).rejects.toThrow('process.exit(1)')

    expect(logger.error).toHaveBeenCalledOnce()
    expect(logger.error.mock.calls[0][0]).toContain('Package Center')
  })

  describe('the apt ownership guard', () => {
    const originalExecPath = process.execPath
    const originalGetuid = Object.getOwnPropertyDescriptor(process, 'getuid')

    beforeEach(() => {
      files.clear()
      Object.defineProperty(process, 'execPath', { value: '/usr/bin/node', configurable: true })
      // Not vi.spyOn: in CI process.getuid is not an own, spy-able property
      Object.defineProperty(process, 'getuid', {
        value: () => 0,
        configurable: true,
        writable: true,
      })
      execSync.mockReset()
      execSync.mockReturnValue(Buffer.from('armv7l'))
      execFileSync.mockReset()
    })

    afterEach(() => {
      Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true })
      if (originalGetuid) {
        Object.defineProperty(process, 'getuid', originalGetuid)
      } else {
        delete (process as any).getuid
      }
    })

    it('refuses to unpack a tarball over a node.js that a package owns', async () => {
      execFileSync.mockReturnValue(Buffer.from('nodejs:armhf: /usr/bin/node\n'))
      const tarball = vi.spyOn(installer as any, 'updateNodeFromTarball').mockResolvedValue(undefined)

      await expect(installer.updateNodejs({ target: '22.22.2', rebuild: false })).rejects.toThrow('process.exit(1)')

      expect(tarball).not.toHaveBeenCalled()
      expect(logger.error.mock.calls[0][0]).toContain('"nodejs"')
      expect(logger.error.mock.calls[1][0]).toContain('--only-upgrade nodejs')
      expect(logger.error.mock.calls[2][0]).toContain('22.22.2')
    })

    it('still uses the tarball when no package owns node.js', async () => {
      execFileSync.mockImplementation(() => {
        throw new Error('no path found')
      })
      const tarball = vi.spyOn(installer as any, 'updateNodeFromTarball').mockResolvedValue(undefined)

      await installer.updateNodejs({ target: '22.22.2', rebuild: false })

      expect(tarball).toHaveBeenCalledOnce()
    })
  })

  describe('from nodesource', () => {
    const target = `v${Number(process.versions.node.split('.')[0]) + 2}.0.0`
    const targetMajor = Number(process.versions.node.split('.')[0]) + 2
    const commands = () => execSync.mock.calls.map(([command]) => String(command))
    const update = (version = target) => (installer as any).updateNodeFromNodesource({ target: version, rebuild: false })

    beforeEach(() => {
      files.clear()
      execSync.mockReset()
      execSync.mockImplementation((command: string) => {
        if (command.includes('gpg --dearmor')) {
          files.set(CURRENT_KEYRING, 'new-key')
        }
        return Buffer.from('glibc 2.36')
      })
    })

    it('changes only the version in a deb822 file and refreshes its keyring', async () => {
      files.set(SOURCES, DEB822)
      files.set(OLD_KEYRING, 'old-key')

      await update()

      expect(files.get(SOURCES)).toBe(DEB822.replace('node_22.x', `node_${targetMajor}.x`))
      expect(files.get(OLD_KEYRING)).toBe('new-key')
      expect(files.has(LIST)).toBe(false)
    })

    it('rewrites an existing one-line file and removes the old keyring', async () => {
      files.set(LIST, 'deb https://deb.nodesource.com/node_22.x nodistro main\n')
      files.set(OLD_KEYRING, 'old-key')

      await update()

      expect(files.get(LIST)).toContain(`signed-by=${CURRENT_KEYRING}`)
      expect(files.get(LIST)).toContain(`node_${targetMajor}.x`)
      expect(files.has(SOURCES)).toBe(false)
      expect(files.has(OLD_KEYRING)).toBe(false)
    })

    it('drops the one-line file when a deb822 file also exists', async () => {
      files.set(SOURCES, DEB822)
      files.set(LIST, 'old list\n')

      await update()

      expect(files.has(LIST)).toBe(false)
    })

    it('restores the repo files when the new repo cannot be fetched', async () => {
      files.set(SOURCES, DEB822)
      files.set(LIST, 'old list\n')
      files.set(OLD_KEYRING, 'old-key')
      execSync.mockImplementation((command: string) => {
        if (command === 'apt-get update') {
          throw new Error('no Release file')
        }
        if (command.includes('gpg --dearmor')) {
          files.set(CURRENT_KEYRING, 'new-key')
        }
        return Buffer.from('glibc 2.36')
      })

      await expect(update()).rejects.toThrow('process.exit(1)')

      expect(files.get(SOURCES)).toBe(DEB822)
      expect(files.get(LIST)).toBe('old list\n')
      expect(files.has(OLD_KEYRING)).toBe(true)
      expect(commands().some(command => command.includes('install -y nodejs'))).toBe(false)
    })

    it('does not remove node.js on a downgrade until the repo has been fetched', async () => {
      files.set(SOURCES, DEB822)

      await update('v1.0.0')

      expect(commands().indexOf('apt-get update')).toBeLessThan(commands().indexOf('apt-get remove -y nodejs'))
      expect(commands().indexOf('apt-get remove -y nodejs')).toBeLessThan(commands().indexOf('apt-get install -y nodejs'))
    })

    it('fails without changing a deb822 file that has no version', async () => {
      files.set(SOURCES, 'Types: deb\n')

      await expect(update()).rejects.toThrow('process.exit(1)')

      expect(files.get(SOURCES)).toBe('Types: deb\n')
    })
  })

  describe('nodesource repo file helpers', () => {
    it('replaces every version', () => {
      expect(setNodesourceMajorVersion('node_20.x node_22.x', 24)).toBe('node_24.x node_24.x')
    })

    it('reports a file with no version', () => {
      expect(setNodesourceMajorVersion('Types: deb', 24)).toBeNull()
    })

    it.each([
      ['Signed-By: /usr/share/keyrings/a.gpg\n', '/usr/share/keyrings/a.gpg'],
      ['signed-by:\t/etc/apt/keyrings/b  \nSuites: x\n', '/etc/apt/keyrings/b'],
      ['Signed-By:\n -----BEGIN PGP PUBLIC KEY BLOCK-----\n', null],
      ['# Signed-By: /commented/out\n', null],
      ['Types: deb\n', null],
    ])('reads the keyring from %j', (input, expected) => {
      expect(getSignedByKeyring(input)).toBe(expected)
    })

    it.each([
      ['nodejs: /usr/bin/node\n', 'nodejs'],
      ['nodejs:armhf: /usr/bin/node\n', 'nodejs'],
      ['', null],
    ])('reads the owning package from %j', (input, expected) => {
      expect(parseDpkgOwner(input)).toBe(expected)
    })
  })
})
