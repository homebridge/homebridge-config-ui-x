import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { PluginsService } from '../../src/modules/plugins/plugins.service.js'

vi.mock('node:os', async importOriginal => ({
  ...await importOriginal<typeof import('node:os')>(),
  platform: () => 'win32',
}))

/**
 * On Windows npm is `npm.cmd`, which cmd.exe runs, so the arguments are checked for the characters cmd.exe acts
 * on. The program path itself is not an argument: it comes from the install (the user's folder), not a request.
 */
describe('running npm on windows', () => {
  function service() {
    const spawn = vi.fn(() => ({
      onData: vi.fn(),
      onExit: (handler: (e: { exitCode: number }) => void) => setImmediate(() => handler({ exitCode: 0 })),
      kill: vi.fn(),
    }))
    const plugins = Object.create(PluginsService.prototype) as any
    Object.assign(plugins, {
      configService: {
        ui: { sudo: true },
        minimumNodeVersion: '0.0.0',
        customPluginPath: undefined,
      },
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      nodePtyService: { spawn },
      installedPluginsCache: {
        del: vi.fn(),
      },
      pluginManagementInProgress: 0,
    })
    return { plugins, spawn }
  }

  it('runs npm from a user folder whose name has a ! or a %', async () => {
    // Regression: the program path was checked too, so a user called "Bob!" could not install anything
    const { plugins, spawn } = service()

    await plugins.runNpmCommand(['C:\\Users\\Bob!\\AppData\\Roaming\\npm\\npm.cmd', 'install', 'homebridge-x@1.0.0'], 'C:\\hb', new EventEmitter())

    expect(spawn).toHaveBeenCalledOnce()
  })

  it('refuses an argument cmd.exe would read as a command, before npm starts', async () => {
    const { plugins, spawn } = service()

    await expect(plugins.runNpmCommand(['C:\\npm\\npm.cmd', 'install', 'homebridge-x@1.0.0&calc'], 'C:\\hb', new EventEmitter()))
      .rejects
      .toThrow('homebridge-x@1.0.0&calc')
    expect(spawn).not.toHaveBeenCalled()
  })
})
