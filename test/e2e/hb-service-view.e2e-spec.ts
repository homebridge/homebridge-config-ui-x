import type { HomebridgeServiceHelper } from '../../src/bin/hb-service.js'

import process from 'node:process'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { DarwinInstaller } from '../../src/bin/platforms/darwin.js'
import { FreeBSDInstaller } from '../../src/bin/platforms/freebsd.js'
import { Win32Installer } from '../../src/bin/platforms/win32.js'

describe('hb-service view', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['macOS', DarwinInstaller],
    ['Windows', Win32Installer],
    ['FreeBSD', FreeBSDInstaller],
  ])(
    'goes on to show the log file on %s instead of ending the command',
    async (_label, Installer) => {
      const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
      const hbService = {
        logger: {
          error: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
        },
      } as unknown as HomebridgeServiceHelper

      await new Installer(hbService).viewLogs()

      expect(exit).not.toHaveBeenCalled()
      expect(hbService.logger.error).not.toHaveBeenCalled()
    },
  )
})
