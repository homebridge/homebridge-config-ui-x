import type { HomebridgeServiceHelper } from '../../src/bin/hb-service.js'

import process from 'node:process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Win32Installer } from '../../src/bin/platforms/win32.js'

const { execFileSync, execSync } = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({ execFileSync, execSync }))

// Pretend nssm.exe is already present so install() does not download it
vi.mock('fs-extra/esm', () => ({
  pathExists: vi.fn().mockResolvedValue(true),
  remove: vi.fn(),
}))

describe('HbService Win32Installer (e2e)', () => {
  let installer: Win32Installer

  beforeEach(() => {
    vi.clearAllMocks()

    const hbService = {
      serviceName: 'Homebridge',
      selfPath: 'C:\\Users\\John Doe\\AppData\\Local\\Author Software\\nvm\\v22.12.0\\node_modules\\homebridge-config-ui-x\\dist\\bin\\hb-service.js',
      storagePath: 'C:\\Users\\John Doe\\.homebridge',
      logger: { log: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
      portCheck: vi.fn(),
      storagePathCheck: vi.fn(),
      configCheck: vi.fn(),
      printPostInstallInstructions: vi.fn(),
    } as unknown as HomebridgeServiceHelper

    installer = new Win32Installer(hbService)
  })

  it('should quote paths containing spaces when registering the service with nssm', async () => {
    await installer.install()

    expect(execFileSync.mock.calls[0][1]).toEqual([
      'install',
      'Homebridge',
      process.execPath,
      '"C:\\Users\\John Doe\\AppData\\Local\\Author Software\\nvm\\v22.12.0\\node_modules\\homebridge-config-ui-x\\dist\\bin\\hb-service.js"',
      'run',
      '-I',
      '-U',
      '"C:\\Users\\John Doe\\.homebridge"',
    ])
  })

  it('should not quote the storage path in AppEnvironmentExtra', async () => {
    await installer.install()

    expect(execFileSync.mock.calls[1][1]).toEqual([
      'set',
      'Homebridge',
      'AppEnvironmentExtra',
      ':UIX_STORAGE_PATH=C:\\Users\\John Doe\\.homebridge',
    ])
  })
})
