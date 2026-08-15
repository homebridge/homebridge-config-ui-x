import type { IPty } from '@homebridge/node-pty-prebuilt-multiarch'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import type { WsEventEmitter } from '../../src/modules/platform-tools/terminal/terminal.interfaces.js'

import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import process from 'node:process'

import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy } from 'fs-extra'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { NodePtyService } from '../../src/core/node-pty/node-pty.service.js'
import { TerminalGateway } from '../../src/modules/platform-tools/terminal/terminal.gateway.js'
import { TerminalModule } from '../../src/modules/platform-tools/terminal/terminal.module.js'
import { TerminalService } from '../../src/modules/platform-tools/terminal/terminal.service.js'

// create mock websocket client
class MockWsEventEmitter extends EventEmitter implements WsEventEmitter {
  disconnect = vi.fn()
}

describe('PlatformToolsTerminal (e2e)', () => {
  let app: NestFastifyApplication

  let authFilePath: string
  let secretsFilePath: string

  let configService: ConfigService
  let terminalGateway: TerminalGateway
  let terminalService: TerminalService
  let nodePtyService: NodePtyService
  let authorization: string
  let client: WsEventEmitter

  const size = { cols: 80, rows: 24 }

  const mockTerm = {
    onData: vi.fn() as IPty['onData'],
    onExit: vi.fn() as IPty['onExit'],
    kill: vi.fn() as IPty['kill'],
    write: vi.fn() as IPty['write'],
    resize: vi.fn() as IPty['resize'],
  } as IPty

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
      imports: [TerminalModule, AuthModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    configService = app.get(ConfigService)
    terminalGateway = app.get(TerminalGateway)
    terminalService = app.get(TerminalService)
    nodePtyService = app.get(NodePtyService)
  })

  beforeEach(async () => {
    vi.resetAllMocks()

    // create client
    client = new MockWsEventEmitter()

    vi.spyOn(client, 'emit')
    vi.spyOn(client, 'on')
    vi.spyOn(nodePtyService, 'spawn')
      .mockImplementationOnce(() => {
        return mockTerm
      })

    configService.enableTerminalAccess = true
  })

  afterEach(async () => {
    client.emit('disconnect')
  })

  it('ON /platform-tools/terminal/start-session (terminal access not enabled)', async () => {
    configService.enableTerminalAccess = false

    terminalGateway.startTerminalSession(client, size)

    expect(client.disconnect).toHaveBeenCalled()
    expect(nodePtyService.spawn).not.toHaveBeenCalled()
  })

  it('ON /platform-tools/terminal/start-session', async () => {
    terminalGateway.startTerminalSession(client, size)

    await new Promise(res => setTimeout(res, 100))

    expect(nodePtyService.spawn).toHaveBeenCalled()
  })

  it('ON /platform-tools/terminal/start-session (cleanup)', async () => {
    terminalGateway.startTerminalSession(client, size)

    await new Promise(res => setTimeout(res, 100))

    expect(nodePtyService.spawn).toHaveBeenCalled()

    // check initial listeners
    expect(client.listenerCount('stdin')).toBe(1)
    expect(client.listenerCount('resize')).toBe(1)
    expect(client.listenerCount('end')).toBe(1)
    expect(client.listenerCount('disconnect')).toBe(1)

    // End the session
    client.emit('end')

    // check the listeners were removed
    expect(client.listenerCount('stdin')).toBe(0)
    expect(client.listenerCount('resize')).toBe(0)
    expect(client.listenerCount('end')).toBe(0)
    expect(client.listenerCount('disconnect')).toBe(0)

    // check the terminal was exited
    expect(mockTerm.onExit).toHaveBeenCalled()
    expect(mockTerm.kill).toHaveBeenCalled()
  })

  it('ON /platform-tools/terminal/start-session (stdin)', async () => {
    terminalGateway.startTerminalSession(client, size)

    await new Promise(res => setTimeout(res, 100))

    expect(nodePtyService.spawn).toHaveBeenCalled()

    // Send stdin
    client.emit('stdin', 'help')
    expect(mockTerm.write).toHaveBeenCalledWith('help')
  })

  it('ON /platform-tools/terminal/start-session (resize)', async () => {
    terminalGateway.startTerminalSession(client, size)

    await new Promise(res => setTimeout(res, 100))

    expect(nodePtyService.spawn).toHaveBeenCalled()

    // Send stdin
    client.emit('resize', { cols: 20, rows: 25 })
    expect(mockTerm.resize).toHaveBeenCalledWith(20, 25)
  })

  it('ON /platform-tools/terminal/start-session (resize failure is tolerated)', async () => {
    terminalGateway.startTerminalSession(client, size)

    await new Promise(res => setTimeout(res, 100))

    expect(nodePtyService.spawn).toHaveBeenCalled()

    // A resize on a terminal that has already exited must not crash the session
    vi.mocked(mockTerm.resize).mockImplementationOnce(() => {
      throw new Error('read EPIPE')
    })
    expect(() => client.emit('resize', { cols: 20, rows: 25 })).not.toThrow()

    // The session is still usable afterwards
    client.emit('stdin', 'help')
    expect(mockTerm.write).toHaveBeenCalledWith('help')
  })

  it('ON /platform-tools/terminal/start-session (one client disconnecting does not mute another session\'s exit)', async () => {
    // Regression: `ending` was a shared instance field, so any client's
    // disconnect set it true for every session and suppressed the
    // process-exit notification for every other client's shell.
    const clientA = new MockWsEventEmitter()
    const clientB = new MockWsEventEmitter()

    let exitHandlerB: (info: { exitCode: number }) => void
    const termA = { ...mockTerm, onExit: vi.fn(), kill: vi.fn() } as unknown as IPty
    const termB = {
      ...mockTerm,
      kill: vi.fn(),
      onExit: vi.fn((handler: any) => {
        exitHandlerB = handler
      }),
    } as unknown as IPty

    vi.mocked(nodePtyService.spawn).mockReset()
    vi.mocked(nodePtyService.spawn)
      .mockImplementationOnce(() => termA)
      .mockImplementationOnce(() => termB)

    // start the sessions sequentially so termA deterministically belongs to
    // clientA and termB to clientB
    await terminalGateway.startTerminalSession(clientA, size)
    await terminalGateway.startTerminalSession(clientB, size)

    // client A goes away; B's shell then exits (e.g. the user typed `exit`)
    clientA.emit('disconnect')
    vi.spyOn(clientB, 'emit')
    exitHandlerB({ exitCode: 0 })

    expect(clientB.emit).toHaveBeenCalledWith('process-exit', 0)
    clientB.emit('disconnect')
  })

  describe('HTTP Endpoints', () => {
    beforeEach(async () => {
      authorization = `bearer ${(await app.inject({
        method: 'POST',
        path: '/auth/login',
        payload: {
          username: 'admin',
          password: 'admin',
        },
      })).json().access_token}`
    })

    it('GET /platform-tools/terminal/has-persistent-session (no session)', async () => {
      // Ensure no persistent session
      terminalService.destroyPersistentSession()

      const res = await app.inject({
        method: 'GET',
        path: '/platform-tools/terminal/has-persistent-session',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().hasPersistentSession).toBe(false)
    })

    it('POST /platform-tools/terminal/destroy-persistent-session', async () => {
      const res = await app.inject({
        method: 'POST',
        path: '/platform-tools/terminal/destroy-persistent-session',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().success).toBe(true)
    })
  })

  describe('Persistent Terminal', () => {
    afterEach(() => {
      // Clean up persistent terminal after each persistent test
      terminalService.destroyPersistentSession()
    })

    it('should create persistent terminal when persistence is enabled', async () => {
      configService.ui.terminal = { persistence: true, bufferSize: 10000 }

      vi.spyOn(nodePtyService, 'spawn').mockReturnValue(mockTerm)

      terminalGateway.startTerminalSession(client, size)

      await new Promise(res => setTimeout(res, 100))

      expect(nodePtyService.spawn).toHaveBeenCalled()
      expect(terminalService.hasPersistentSession()).toBe(true)
    })

    it('should not kill terminal on client disconnect in persistent mode', async () => {
      configService.ui.terminal = { persistence: true, bufferSize: 10000 }

      vi.spyOn(nodePtyService, 'spawn').mockReturnValue(mockTerm)

      terminalGateway.startTerminalSession(client, size)

      await new Promise(res => setTimeout(res, 100))

      // Disconnect client
      client.emit('disconnect')

      // Terminal should still be alive
      expect(terminalService.hasPersistentSession()).toBe(true)
      expect(mockTerm.kill).not.toHaveBeenCalled()
    })

    it('should destroy persistent session when destroyPersistentSession is called', async () => {
      configService.ui.terminal = { persistence: true, bufferSize: 10000 }

      vi.spyOn(nodePtyService, 'spawn').mockReturnValue(mockTerm)

      terminalGateway.startTerminalSession(client, size)

      await new Promise(res => setTimeout(res, 100))

      expect(terminalService.hasPersistentSession()).toBe(true)

      terminalService.destroyPersistentSession()

      expect(terminalService.hasPersistentSession()).toBe(false)
      expect(mockTerm.kill).toHaveBeenCalled()
    })
  })

  /**
   * Which installs may use the terminal at all. This decides both the sidebar
   * link and whether TerminalService will start a session, and it is read from
   * the environment once, when ConfigService is constructed - so each case
   * below builds its own.
   *
   * ⚠️ `HOMEBRIDGE_CONFIG_UI_TERMINAL=1` is the opt-in for installs that are
   * not Docker: `nodemon.json` sets it for the dev server, and hb-service
   * writes it into the systemd environment file for apt package installs.
   * Nothing covered it before, so when the expression was accidentally cut
   * short the terminal silently disappeared for all of them.
   */
  describe('which installs may use the terminal', () => {
    const withEnv = (env: Record<string, string | undefined>) => {
      const saved: Record<string, string | undefined> = {}
      for (const [key, value] of Object.entries(env)) {
        saved[key] = process.env[key]
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
      try {
        return new ConfigService()
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) {
            delete process.env[key]
          } else {
            process.env[key] = value
          }
        }
      }
    }

    it('is enabled by the opt-in environment variable, outside docker', () => {
      const config = withEnv({
        HOMEBRIDGE_CONFIG_UI_TERMINAL: '1',
        HOMEBRIDGE_CONFIG_UI: undefined,
        HOMEBRIDGE_SYNOLOGY_PACKAGE: undefined,
        HOMEBRIDGE_APT_PACKAGE: undefined,
      })

      expect(config.runningInDocker).toBe(false)
      expect(config.enableTerminalAccess).toBe(true)
    })

    it('is enabled for a synology package install', () => {
      const config = withEnv({
        HOMEBRIDGE_CONFIG_UI_TERMINAL: undefined,
        HOMEBRIDGE_CONFIG_UI: undefined,
        HOMEBRIDGE_SYNOLOGY_PACKAGE: '1',
        HOMEBRIDGE_APT_PACKAGE: undefined,
      })

      expect(config.enableTerminalAccess).toBe(true)
    })

    it('is enabled for an apt package install, and that install can turn it off', () => {
      const enabled = withEnv({
        HOMEBRIDGE_CONFIG_UI_TERMINAL: '1',
        HOMEBRIDGE_CONFIG_UI: undefined,
        HOMEBRIDGE_SYNOLOGY_PACKAGE: undefined,
        HOMEBRIDGE_APT_PACKAGE: '1',
      })
      expect(enabled.enableTerminalAccess).toBe(true)

      const disabled = withEnv({
        HOMEBRIDGE_CONFIG_UI_TERMINAL: '0',
        HOMEBRIDGE_CONFIG_UI: undefined,
        HOMEBRIDGE_SYNOLOGY_PACKAGE: undefined,
        HOMEBRIDGE_APT_PACKAGE: '1',
      })
      expect(disabled.enableTerminalAccess).toBe(false)
    })

    it('is off for a plain install that has not opted in', () => {
      const config = withEnv({
        HOMEBRIDGE_CONFIG_UI_TERMINAL: undefined,
        HOMEBRIDGE_CONFIG_UI: undefined,
        HOMEBRIDGE_SYNOLOGY_PACKAGE: undefined,
        HOMEBRIDGE_APT_PACKAGE: undefined,
      })

      expect(config.enableTerminalAccess).toBe(false)
    })

    /**
     * The log restriction sits directly above this in the source and is a
     * separate setting: it must come from the UI config alone, and never
     * inherit whatever the terminal environment says.
     */
    it('does not let the terminal environment restrict the log', () => {
      const config = withEnv({
        HOMEBRIDGE_CONFIG_UI_TERMINAL: '1',
        HOMEBRIDGE_CONFIG_UI: undefined,
        HOMEBRIDGE_SYNOLOGY_PACKAGE: '1',
        HOMEBRIDGE_APT_PACKAGE: '1',
      })

      expect(config.restrictLogsToAdmins).toBe(false)
    })
  })

  afterAll(async () => {
    await app.close()
  })
})
