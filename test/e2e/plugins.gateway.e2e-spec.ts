import { EventEmitter } from 'node:events'
import { platform } from 'node:os'

import { resolve } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { FastifyAdapter } from '@nestjs/platform-fastify'

import { Test } from '@nestjs/testing'
import { copy, remove } from 'fs-extra'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { ConfigService } from '../../src/core/config/config.service'
import { NodePtyService } from '../../src/core/node-pty/node-pty.service'
import { PluginsGateway } from '../../src/modules/plugins/plugins.gateway'
import { PluginsModule } from '../../src/modules/plugins/plugins.module'
import { PluginsService } from '../../src/modules/plugins/plugins.service'

describe('PluginsGateway (e2e)', () => {
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
    spawn: jest.fn(),
  }

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')
    process.env.UIX_CUSTOM_PLUGIN_PATH = resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')
    pluginsPath = process.env.UIX_CUSTOM_PLUGIN_PATH

    // setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // setup test auth file
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
    jest.resetAllMocks()

    // create client
    client = new EventEmitter()

    jest.spyOn(client, 'emit')
    jest.spyOn(client, 'on')

    // ensure config is correct
    configService.ui.sudo = false
    configService.customPluginPath = pluginsPath
  })

  it('ON /plugins/install', async () => {
    const mockSpawn = jest.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = new EventEmitter()
        setTimeout(() => {
          term.emit('data', 'some log from terminal')
          term.emit('exit', 0)
        }, 10)
        return term
      })

    await pluginsGateway.installPlugin(client, { name: 'homebridge-mock-plugin' })

    // expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '-g', 'homebridge-mock-plugin@latest'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', 'homebridge-mock-plugin@latest'], expect.anything())
    }

    // expect the terminal logs to be sent to the client
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('some log from terminal'))

    // expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/install (custom version)', async () => {
    const mockSpawn = jest.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = new EventEmitter()
        setTimeout(() => {
          term.emit('data', 'some log from terminal')
          term.emit('exit', 0)
        }, 10)
        return term
      })

    await pluginsGateway.installPlugin(client, { name: 'homebridge-mock-plugin', version: '3.2.5' })

    // expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '-g', 'homebridge-mock-plugin@3.2.5'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', 'homebridge-mock-plugin@3.2.5'], expect.anything())
    }

    // expect the terminal logs to be sent to the client
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('some log from terminal'))

    // expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/install (sudo)', async () => {
    // sudo does not work on windows
    if (platform() === 'win32') {
      return
    }

    // enable sudo
    configService.ui.sudo = true

    const mockSpawn = jest.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = new EventEmitter()
        setTimeout(() => {
          term.emit('exit', 0)
        }, 10)
        return term
      })

    await pluginsGateway.installPlugin(client, { name: 'homebridge-mock-plugin', version: 'latest' })

    // expect the npm command to be spawned with sudo
    expect(mockSpawn).toHaveBeenCalledWith('sudo', ['-E', '-n', 'npm', 'install', 'homebridge-mock-plugin@latest'], expect.anything())

    // expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/install (fail)', async () => {
    const mockSpawn = jest.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = new EventEmitter()
        setTimeout(() => {
          term.emit('exit', 1)
        }, 10)
        return term
      })

    try {
      await pluginsGateway.installPlugin(client, { name: 'homebridge-mock-plugin', version: 'latest' })
    } catch (e) {}

    // expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '-g', 'homebridge-mock-plugin@latest'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', 'homebridge-mock-plugin@latest'], expect.anything())
    }

    // expect the method to let the client know the operation failed
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation failed'))
  })

  it('ON /plugins/uninstall', async () => {
    const mockSpawn = jest.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = new EventEmitter()
        setTimeout(() => {
          term.emit('exit', 0)
        }, 10)
        return term
      })

    try {
      await pluginsGateway.uninstallPlugin(client, { name: 'homebridge-mock-plugin' })
    } catch (e) {}

    // expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['uninstall', '-g', 'homebridge-mock-plugin'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['uninstall', 'homebridge-mock-plugin'], expect.anything())
    }

    // expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/uninstall (prevent self uninstall)', async () => {
    const mockSpawn = jest.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = new EventEmitter()
        setTimeout(() => {
          term.emit('exit', 0)
        }, 10)
        return term
      })

    try {
      await pluginsGateway.uninstallPlugin(client, { name: 'homebridge-config-ui-x' })
    } catch (e) {}

    // expect the npm command not to have to be spawned
    expect(mockSpawn).not.toHaveBeenCalled()

    // expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Cannot uninstall homebridge-config-ui-x'))
  })

  it('ON /plugins/update', async () => {
    const mockSpawn = jest.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = new EventEmitter()
        setTimeout(() => {
          term.emit('exit', 0)
        }, 10)
        return term
      })

    try {
      await pluginsGateway.updatePlugin(client, { name: 'homebridge-mock-plugin', version: 'latest' })
    } catch (e) {}

    // expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '-g', 'homebridge-mock-plugin@latest'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', 'homebridge-mock-plugin@latest'], expect.anything())
    }

    // expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/update (custom version)', async () => {
    const mockSpawn = jest.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = new EventEmitter()
        setTimeout(() => {
          term.emit('exit', 0)
        }, 10)
        return term
      })

    try {
      await pluginsGateway.updatePlugin(client, { name: 'homebridge-mock-plugin', version: '3.4.6' })
    } catch (e) {}

    // expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '-g', 'homebridge-mock-plugin@3.4.6'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', 'homebridge-mock-plugin@3.4.6'], expect.anything())
    }

    // expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/homebridge-update', async () => {
    // mock get homebridge package
    pluginsService.getHomebridgePackage = async () => {
      return {
        name: 'homebridge',
        private: false,
        publicPackage: true,
        installPath: pluginsPath,
      }
    }

    const mockSpawn = jest.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = new EventEmitter()
        setTimeout(() => {
          term.emit('exit', 0)
        }, 10)
        return term
      })

    try {
      await pluginsGateway.homebridgeUpdate(client, {})
    } catch (e) {}

    // expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '-g', 'homebridge@latest'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', 'homebridge@latest'], expect.objectContaining({
        cwd: resolve(process.env.UIX_STORAGE_PATH, 'plugins'),
      }))
    }
    // expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  it('ON /plugins/homebridge-update (custom version)', async () => {
    // mock get homebridge package
    pluginsService.getHomebridgePackage = async () => {
      return {
        name: 'homebridge',
        private: false,
        publicPackage: true,
        installPath: pluginsPath,
      }
    }

    const mockSpawn = jest.spyOn(nodePtyService, 'spawn')
      .mockImplementation(() => {
        const term = new EventEmitter()
        setTimeout(() => {
          term.emit('exit', 0)
        }, 10)
        return term
      })

    try {
      await pluginsGateway.homebridgeUpdate(client, { version: '1.2.5' })
    } catch (e) {}

    // expect the npm command to be spawned
    if (platform() === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(win32NpmPath, ['install', '-g', 'homebridge@1.2.5'], expect.anything())
    } else {
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', 'homebridge@1.2.5'], expect.objectContaining({
        cwd: resolve(process.env.UIX_STORAGE_PATH, 'plugins'),
      }))
    }
    // expect the method to let the client know the command succeeded
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Operation succeeded!'))
  })

  afterAll(async () => {
    await app.close()
  })
})
