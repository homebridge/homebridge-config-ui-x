import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'
import type { Mock } from 'vitest'

import { resolve } from 'node:path'
import process from 'node:process'

import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { LinuxModule } from '../../src/modules/platform-tools/linux/linux.module.js'
import { LinuxService } from '../../src/modules/platform-tools/linux/linux.service.js'

// Several tests below restore the real LinuxService implementation and call it
// with the default `sudo -n shutdown -r now` / `-h now` / apt-get commands. On a
// CI runner with passwordless sudo those commands actually execute, halting the
// runner mid-suite (exit 143, "runner has received a shutdown signal"). Stub the
// process-spawning primitives so the command-building + return-shape logic still
// runs and is asserted, but nothing is ever shelled out.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: vi.fn(() => ({ on: vi.fn() })),
    exec: vi.fn((_command: string, callback?: (...args: any[]) => void) => {
      if (typeof callback === 'function') {
        callback(null, '', '')
      }
      return { on: vi.fn() }
    }),
  }
})

describe('PlatformToolsLinux (e2e)', () => {
  let app: NestFastifyApplication

  let authFilePath: string
  let secretsFilePath: string
  let authorization: string
  let restartHostFn: Mock
  let shutdownHostFn: Mock
  let updateAptPackageFn: Mock
  let linuxService: LinuxService

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [LinuxModule, AuthModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    linuxService = app.get(LinuxService)
  })

  beforeEach(async () => {
    // Setup mock functions
    restartHostFn = vi.fn()
    shutdownHostFn = vi.fn()
    updateAptPackageFn = vi.fn()
    linuxService.restartHost = restartHostFn as any
    linuxService.shutdownHost = shutdownHostFn as any
    linuxService.updateAptPackage = updateAptPackageFn as any

    // Get auth token before each test
    authorization = `bearer ${(await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token}`
  })

  it('GET /platform-tools/linux/restart-host', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/linux/restart-host',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(restartHostFn).toHaveBeenCalled()
  })

  it('GET /platform-tools/linux/shutdown-host', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/linux/shutdown-host',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(shutdownHostFn).toHaveBeenCalled()
  })

  it('PUT /platform-tools/linux/update-apt-package', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/linux/update-apt-package',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(updateAptPackageFn).toHaveBeenCalled()
  })

  it('restartHost returns correct shape with default command', () => {
    // Restore the real implementation
    linuxService.restartHost = LinuxService.prototype.restartHost.bind(linuxService)

    const result = linuxService.restartHost()

    expect(result).toEqual({
      ok: true,
      command: ['sudo -n shutdown -r now'],
    })
  })

  it('shutdownHost returns correct shape with default command', () => {
    // Restore the real implementation
    linuxService.shutdownHost = LinuxService.prototype.shutdownHost.bind(linuxService)

    const result = linuxService.shutdownHost()

    expect(result).toEqual({
      ok: true,
      command: ['sudo -n shutdown -h now'],
    })
  })

  it('updateAptPackage returns correct shape with default command', () => {
    // Restore the real implementation
    linuxService.updateAptPackage = LinuxService.prototype.updateAptPackage.bind(linuxService)

    const configService = app.get(ConfigService)
    configService.runningInPackageMode = true

    const result = linuxService.updateAptPackage()

    expect(result).toEqual({
      ok: true,
      command: [
        'sudo -n HOMEBRIDGE_CONFIG_UI_TERMINAL=0 /usr/bin/apt-get update',
        'sudo -n HOMEBRIDGE_CONFIG_UI_TERMINAL=0 /usr/bin/apt-get install --only-upgrade -y homebridge',
      ],
    })
  })

  it('restartHost uses custom command from config', () => {
    linuxService.restartHost = LinuxService.prototype.restartHost.bind(linuxService)

    const configService = app.get(ConfigService)
    configService.ui.linux = { restart: 'custom-restart-cmd' }

    const result = linuxService.restartHost()

    expect(result).toEqual({
      ok: true,
      command: ['custom-restart-cmd'],
    })

    // Cleanup
    delete configService.ui.linux
  })

  it('shutdownHost uses custom command from config', () => {
    linuxService.shutdownHost = LinuxService.prototype.shutdownHost.bind(linuxService)

    const configService = app.get(ConfigService)
    configService.ui.linux = { shutdown: 'custom-shutdown-cmd' }

    const result = linuxService.shutdownHost()

    expect(result).toEqual({
      ok: true,
      command: ['custom-shutdown-cmd'],
    })

    // Cleanup
    delete configService.ui.linux
  })

  afterAll(async () => {
    await app.close()
  })
})
