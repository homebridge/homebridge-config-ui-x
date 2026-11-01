import type { HomebridgeServiceHelper } from '../../src/bin/hb-service.js'

import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LinuxInstaller } from '../../src/bin/platforms/linux.js'

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
    installer = new LinuxInstaller({ logger } as unknown as HomebridgeServiceHelper)
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
})
