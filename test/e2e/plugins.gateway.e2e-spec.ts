import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { EventEmitter } from 'node:events'
import { platform } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, remove } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigService } from '../../src/core/config/config.service'
import { NodePtyService } from '../../src/core/node-pty/node-pty.service'
import { PluginsGateway } from '../../src/modules/plugins/plugins.gateway'
import { PluginsModule } from '../../src/modules/plugins/plugins.module'
import { PluginsService } from '../../src/modules/plugins/plugins.service'

describe('PluginsGateway (e2e)', { timeout: 10_000 }, () => {
  let app: NestFastifyApplication

  let authFilePath: string
  let secretsFilePath: string
  let pluginsPath: string

  let configService: ConfigService
  let pluginsService: PluginsService
  let pluginsGateway: PluginsGateway
  let client: EventEmitter

  let win32NpmPath: string

  const nodePtyService = {
    spawn: vi.fn(),
  }

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')
    process.env.UIX_CUSTOM_PLUGIN_PATH = resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')
    pluginsPath = process.env.UIX_CUSTOM_PLUGIN_PATH

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    await remove(pluginsPath)
    await copy(resolve(__dirname, '../mocks', 'plugins'), pluginsPath)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PluginsModule],
    }).overrideProvider(NodePtyService).useValue(nodePtyService).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    configService = app.get(ConfigService)
    pluginsService = app.get(PluginsService)
    pluginsGateway = app.get(PluginsGateway)

    win32NpmPath = (pluginsService as any).getNpmPath()[0]
  })

  beforeEach(async () => {
    vi.resetAllMocks()

    // create client
    client = new EventEmitter()

    vi.spyOn(client, 'emit')
    vi.spyOn(client, 'on')

    // Ensure config is correct
    configService.ui.sudo = false
    configService.customPluginPath = pluginsPath
  })

  it('ON /plugins/install', async () => {
    const mockSpawn = vi.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = {
          onData: vi.fn(),
          onExit: vi.fn(),
          kill: vi.fn(),
        }
        setTimeout(() => {
          term.onData.mock.calls[0]?.[0]('some log from terminal')
          term.onExit.mock.calls[0]?.[0]({ exitCode: 0 })
        }, 10)
        return term
      })

    await pluginsGateway.installPlugin(client, { name: 'homebridge-mock-plugin' })

    // Expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '-g', '--omit=dev', 'homebridge-mock-plugin@latest'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '--omit=dev', 'homebridge-mock-plugin@latest'], expect.anything())
    }

    // Expect the terminal logs to be sent to the client
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('some log from terminal'))

    // Expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/install (custom version)', async () => {
    const mockSpawn = vi.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = {
          onData: vi.fn(),
          onExit: vi.fn(),
          kill: vi.fn(),
        }
        setTimeout(() => {
          term.onData.mock.calls[0]?.[0]('some log from terminal')
          term.onExit.mock.calls[0]?.[0]({ exitCode: 0 })
        }, 10)
        return term
      })

    await pluginsGateway.installPlugin(client, { name: 'homebridge-mock-plugin', version: '3.2.5' })

    // Expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '-g', '--omit=dev', 'homebridge-mock-plugin@3.2.5'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '--omit=dev', 'homebridge-mock-plugin@3.2.5'], expect.anything())
    }

    // Expect the terminal logs to be sent to the client
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('some log from terminal'))

    // Expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/install (sudo)', { timeout: 30_000 }, async () => {
    // Sudo does not work on windows
    if (platform() === 'win32') {
      return
    }

    // Enable sudo
    configService.ui.sudo = true

    const mockSpawn = vi.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = {
          onData: vi.fn(),
          onExit: vi.fn(),
          kill: vi.fn(),
        }
        setTimeout(() => {
          term.onExit.mock.calls[0]?.[0]({ exitCode: 0 })
        }, 10)
        return term
      })

    await pluginsGateway.installPlugin(client, { name: 'homebridge-mock-plugin', version: 'latest' })

    // Expect the npm command to be spawned with sudo
    expect(mockSpawn).toHaveBeenCalledWith('sudo', ['-E', '-n', 'npm', 'install', '--omit=dev', 'homebridge-mock-plugin@latest'], expect.anything())

    // Expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/install (fail)', async () => {
    const mockSpawn = vi.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = {
          onData: vi.fn(),
          onExit: vi.fn(),
          kill: vi.fn(),
        }
        setTimeout(() => {
          term.onExit.mock.calls[0]?.[0]({ exitCode: 1 })
        }, 10)
        return term
      })

    try {
      await pluginsGateway.installPlugin(client, { name: 'homebridge-mock-plugin', version: 'latest' })
    } catch (e) {}

    // Expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '-g', '--omit=dev', 'homebridge-mock-plugin@latest'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '--omit=dev', 'homebridge-mock-plugin@latest'], expect.anything())
    }

    // Expect the method to let the client know the operation failed
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation failed'))
  })

  it('ON /plugins/uninstall', async () => {
    const mockSpawn = vi.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = {
          onData: vi.fn(),
          onExit: vi.fn(),
          kill: vi.fn(),
        }
        setTimeout(() => {
          term.onExit.mock.calls[0]?.[0]({ exitCode: 0 })
        }, 10)
        return term
      })

    try {
      await pluginsGateway.uninstallPlugin(client, { name: 'homebridge-mock-plugin' })
    } catch (e) {}

    // Expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['uninstall', '-g', 'homebridge-mock-plugin'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['uninstall', 'homebridge-mock-plugin'], expect.anything())
    }

    // Expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/uninstall (prevent self uninstall)', async () => {
    const mockSpawn = vi.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = {
          onData: vi.fn(),
          onExit: vi.fn(),
          kill: vi.fn(),
        }
        setTimeout(() => {
          term.onExit.mock.calls[0]?.[0]({ exitCode: 0 })
        }, 10)
        return term
      })

    try {
      await pluginsGateway.uninstallPlugin(client, { name: 'homebridge-config-ui-x' })
    } catch (e) {}

    // Expect the npm command not to have to be spawned
    expect(mockSpawn).not.toHaveBeenCalled()

    // Expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Cannot uninstall the Homebridge UI'))
  })

  it('ON /plugins/update', async () => {
    const mockSpawn = vi.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = {
          onData: vi.fn(),
          onExit: vi.fn(),
          kill: vi.fn(),
        }
        setTimeout(() => {
          term.onExit.mock.calls[0]?.[0]({ exitCode: 0 })
        }, 10)
        return term
      })

    try {
      await pluginsGateway.updatePlugin(client, { name: 'homebridge-mock-plugin', version: 'latest' })
    } catch (e) {}

    // Expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '-g', '--omit=dev', 'homebridge-mock-plugin@latest'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '--omit=dev', 'homebridge-mock-plugin@latest'], expect.anything())
    }

    // Expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/update (custom version)', async () => {
    const mockSpawn = vi.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = {
          onData: vi.fn(),
          onExit: vi.fn(),
          kill: vi.fn(),
        }
        setTimeout(() => {
          term.onExit.mock.calls[0]?.[0]({ exitCode: 0 })
        }, 10)
        return term
      })

    try {
      await pluginsGateway.updatePlugin(client, { name: 'homebridge-mock-plugin', version: '3.4.6' })
    } catch (e) {}

    // Expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '-g', '--omit=dev', 'homebridge-mock-plugin@3.4.6'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '--omit=dev', 'homebridge-mock-plugin@3.4.6'], expect.anything())
    }

    // Expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/homebridge-update', async () => {
    // Mock get homebridge package
    pluginsService.getHomebridgePackage = async () => {
      return {
        name: 'homebridge',
        private: false,
        publicPackage: true,
        installPath: pluginsPath,
      }
    }

    const mockSpawn = vi.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = {
          onData: vi.fn(),
          onExit: vi.fn(),
          kill: vi.fn(),
        }
        setTimeout(() => {
          term.onExit.mock.calls[0]?.[0]({ exitCode: 0 })
        }, 10)
        return term
      })

    try {
      await pluginsGateway.homebridgeUpdate(client, {})
    } catch (e) {}

    // Expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '--omit=dev', '-g', 'homebridge@latest'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '--omit=dev', 'homebridge@latest'], expect.objectContaining({
        cwd: resolve(process.env.UIX_STORAGE_PATH, 'plugins'),
      }))
    }
    // Expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/homebridge-update (custom version)', async () => {
    // Mock get homebridge package
    pluginsService.getHomebridgePackage = async () => {
      return {
        name: 'homebridge',
        private: false,
        publicPackage: true,
        installPath: pluginsPath,
      }
    }

    const mockSpawn = vi.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = {
          onData: vi.fn(),
          onExit: vi.fn(),
          kill: vi.fn(),
        }
        setTimeout(() => {
          term.onExit.mock.calls[0]?.[0]({ exitCode: 0 })
        }, 10)
        return term
      })

    try {
      await pluginsGateway.homebridgeUpdate(client, { version: '1.2.5' })
    } catch (e) {}

    // Expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '--omit=dev', '-g', 'homebridge@1.2.5'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '--omit=dev', 'homebridge@1.2.5'], expect.objectContaining({
        cwd: resolve(process.env.UIX_STORAGE_PATH, 'plugins'),
      }))
    }
    // Expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/install (webroot version guard rail - should fail)', async () => {
    // Mock configService to have a webroot configured
    const originalWebroot = configService.ui.webroot
    configService.ui.webroot = '/homebridge'

    try {
      // Try to install an older UI version that doesn't support webroot
      await pluginsGateway.installPlugin(client, { name: 'homebridge-config-ui-x', version: '5.4.0' })
    } catch (e) {
      // Should throw an error about webroot compatibility
      expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Cannot install UI version 5.4.0 when a webroot is configured'))
    } finally {
      // Restore original webroot
      configService.ui.webroot = originalWebroot
    }
  })

  it('ON /plugins/install (webroot version guard rail - should succeed)', async () => {
    // Mock configService to have a webroot configured
    const originalWebroot = configService.ui.webroot
    configService.ui.webroot = '/homebridge'

    // Mock spawn to simulate successful installation
    const mockSpawn = vi.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = {
          onData: vi.fn(),
          onExit: vi.fn(),
          kill: vi.fn(),
        }
        setTimeout(() => {
          term.onExit.mock.calls[0]?.[0]({ exitCode: 0 })
        }, 10)
        return term
      })

    try {
      // Try to install a compatible UI version
      await pluginsGateway.installPlugin(client, { name: 'homebridge-config-ui-x', version: '5.99.0' })

      // Should succeed and not show webroot error
      expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
      expect(client.emit).not.toHaveBeenCalledWith('stdout', expect.stringContaining('Cannot install UI version'))
    } finally {
      // Restore original webroot
      configService.ui.webroot = originalWebroot
      mockSpawn.mockRestore()
    }
  })

  it('ON /plugins/install (no webroot configured - should succeed)', async () => {
    // Ensure no webroot is configured
    const originalWebroot = configService.ui.webroot
    configService.ui.webroot = ''

    // Mock spawn to simulate successful installation
    const mockSpawn = vi.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = {
          onData: vi.fn(),
          onExit: vi.fn(),
          kill: vi.fn(),
        }
        setTimeout(() => {
          term.onExit.mock.calls[0]?.[0]({ exitCode: 0 })
        }, 10)
        return term
      })

    try {
      // Try to install an older UI version (should be allowed without webroot)
      await pluginsGateway.installPlugin(client, { name: 'homebridge-config-ui-x', version: '5.0.0' })

      // Should succeed
      expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
    } finally {
      // Restore original webroot
      configService.ui.webroot = originalWebroot
      mockSpawn.mockRestore()
    }
  })

  afterAll(async () => {
    await app.close()
  })
})
