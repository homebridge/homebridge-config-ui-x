import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { EventEmitter } from 'node:events'
import { platform } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { green, red, yellow } from 'bash-color'
import { copy, writeFile } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigService } from '../../src/core/config/config.service.js'
import { NodePtyService } from '../../src/core/node-pty/node-pty.service.js'
import { LogGateway } from '../../src/modules/log/log.gateway.js'
import { LogModule } from '../../src/modules/log/log.module.js'
import { LogService } from '../../src/modules/log/log.service.js'

describe('LogGateway (e2e)', () => {
  let app: NestFastifyApplication

  let authFilePath: string
  let secretsFilePath: string
  let logFilePath: string

  let configService: ConfigService
  let logGateway: LogGateway
  let logService: LogService
  let nodePtyService: NodePtyService
  let client: EventEmitter

  const size = { cols: 80, rows: 24 }

  /**
   * Wait for the tailed log lines to reach the client.
   *
   * These tests spawn a real process (`tail`, or PowerShell's `Get-Content -Wait`)
   * and its first output is its own startup banner, not the file. A fixed sleep
   * therefore only passes while the runner is fast enough: a cold Windows runner
   * took longer than the old 1000ms to get PowerShell going, so the assertion ran
   * against the banner alone and the job failed. Polling returns as soon as the
   * lines land, and only gives up if they genuinely never arrive.
   */
  const expectTailedLines = () => vi.waitFor(() => {
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 1'))
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 2'))
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 3'))
  }, { timeout: 15000, interval: 50 })

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')
    logFilePath = resolve(process.env.UIX_STORAGE_PATH, 'homebridge.log')

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [LogModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    configService = app.get(ConfigService)
    logService = app.get(LogService)
    logGateway = app.get(LogGateway)
    nodePtyService = app.get(NodePtyService)
  })

  beforeEach(async () => {
    if (client) {
      client.emit('disconnect')
    }

    vi.resetAllMocks()

    // create sample data
    const sampleLogData = ['line 1', 'line 2', 'line 3'].join('\n')
    await writeFile(logFilePath, sampleLogData)

    // create client
    client = new EventEmitter()

    vi.spyOn(client, 'emit')
    vi.spyOn(client, 'on')

    // Unset log mode between each test
    configService.ui.sudo = false
    configService.ui.log = undefined
    logService.setLogMethod()
  })

  it('ON /log/tail-log (native)', async () => {
    // Set log mode to native
    configService.ui.log = { method: 'native', path: logFilePath }
    logService.setLogMethod()

    // check the log command is correct
    expect((logService as any).useNative).toBe(true)
    expect((logService as any).command).toBeUndefined()

    logGateway.connect(client, size)

    await expectTailedLines()
  })

  it('ON /log/tail-log (tail)', async () => {
    // This test will not run on windows
    if (platform() === 'win32') {
      return
    }

    // Set log mode to file
    configService.ui.log = { method: 'file', path: logFilePath }
    logService.setLogMethod()

    // check the log command is correct
    expect((logService as any).useNative).toBe(false)
    expect((logService as any).command).toEqual(['tail', '-n', '500', '-f', logFilePath])

    logGateway.connect(client, size)

    await expectTailedLines()
  })

  it('ON /log/tail-log (tail - with sudo)', async () => {
    // This test will not run on windows
    if (platform() === 'win32') {
      return
    }

    // Set log mode to file and enable sudo
    configService.ui.sudo = true
    configService.ui.log = { method: 'file', path: logFilePath }
    logService.setLogMethod()

    // check the log command is correct
    expect((logService as any).useNative).toBe(false)
    expect((logService as any).command).toEqual(['sudo', '-n', 'tail', '-n', '500', '-f', logFilePath])
  })

  it('ON /log/tail-log (systemd)', async () => {
    // This test will not run on windows
    if (platform() === 'win32') {
      return
    }

    // Set log mode to systemd
    configService.ui.log = { method: 'systemd' }
    logService.setLogMethod()

    // check the log command is correct
    expect((logService as any).useNative).toBe(false)
    expect((logService as any).command).toEqual(['journalctl', '-o', 'cat', '-n', '500', '-f', '-u', 'homebridge'])
  })

  it('ON /log/tail-log (systemd - with sudo)', async () => {
    // This test will not run on windows
    if (platform() === 'win32') {
      return
    }

    // Set log mode to systemd
    configService.ui.sudo = true
    configService.ui.log = { method: 'systemd' }
    logService.setLogMethod()

    // check the log command is correct
    expect((logService as any).useNative).toBe(false)
    expect((logService as any).command).toEqual(['sudo', '-n', 'journalctl', '-o', 'cat', '-n', '500', '-f', '-u', 'homebridge'])
  })

  it('ON /log/tail-log (powershell)', async () => {
    // This test will only run on Windows
    if (platform() !== 'win32') {
      return
    }

    // Set log mode to file
    configService.ui.log = { method: 'file', path: logFilePath }
    logService.setLogMethod()

    // check the log command is correct
    expect((logService as any).useNative).toBe(false)
    expect((logService as any).command).toEqual(['powershell.exe', '-command', `Get-Content -Path '${logFilePath}' -Wait -Tail 200`])

    logGateway.connect(client, size)

    await expectTailedLines()
  })

  it('ON /log/tail-log (cleans up connections)', async () => {
    // Set log mode to native
    configService.ui.log = { method: 'native', path: logFilePath }
    logService.setLogMethod()

    logGateway.connect(client, size)

    await new Promise(res => setTimeout(res, 100))

    // Ensure the log is working
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 1'))

    // Initial listeners
    expect((logService as any).nativeTail.listenerCount('line')).toBe(1)
    expect(client.listenerCount('disconnect')).toBe(1)
    expect(client.listenerCount('end')).toBe(1)

    // Emit disconnect
    client.emit('disconnect')

    await new Promise(res => setTimeout(res, 100))

    // Ensure listeners have been removed
    expect((logService as any).nativeTail.listenerCount('line')).toBe(0)
    expect(client.listenerCount('disconnect')).toBe(0)
    expect(client.listenerCount('end')).toBe(0)
  })

  it('ON /log/tail-log (not configured)', async () => {
    logGateway.connect(client, size)

    await new Promise(res => setTimeout(res, 100))

    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Cannot show logs.'))
  })

  it('one client disconnect does not suppress another client\'s tail-exit message', async () => {
    if (platform() === 'win32') {
      // The PTY path is non-Windows only; Windows uses spawn(), tested implicitly elsewhere.
      return
    }

    configService.ui.log = { method: 'file', path: logFilePath }
    logService.setLogMethod()

    // Build two controllable mock PTYs whose onExit callback we can fire manually.
    const ptyExitCallbacks: Array<((event: { exitCode: number }) => void) | null> = [null, null]
    function makeMockPty(slot: number) {
      return {
        onData: vi.fn(() => ({ dispose: vi.fn() })),
        onExit: vi.fn((cb: (e: { exitCode: number }) => void) => {
          ptyExitCallbacks[slot] = cb
          return { dispose: vi.fn() }
        }),
        resize: vi.fn(),
        kill: vi.fn(),
        write: vi.fn(),
      } as any
    }
    const mockPtyA = makeMockPty(0)
    const mockPtyB = makeMockPty(1)

    vi.spyOn(nodePtyService, 'spawn')
      .mockReturnValueOnce(mockPtyA)
      .mockReturnValueOnce(mockPtyB)

    const clientA = new EventEmitter()
    const clientB = new EventEmitter()
    vi.spyOn(clientB, 'emit')

    logGateway.connect(clientA, size)
    logGateway.connect(clientB, size)

    // Client A disconnects first. With a shared instance `ending` flag, this
    // would also flip the flag observed by client B's exit handler.
    clientA.emit('disconnect')

    // Client B's tail subprocess now exits unexpectedly (exit code 1).
    ptyExitCallbacks[1]?.({ exitCode: 1 })

    expect(clientB.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('exited with code 1'))

    // Tidy up so beforeEach doesn't see lingering listeners on the spare clients.
    clientB.emit('disconnect')
  })

  describe('emitMessage', () => {
    // Mirrors the line format written by the hb-service supervisor:
    // <grey>[date]<reset> <cyan>[HB Supervisor]<reset> [LEVEL] message
    const supervisor = '\x1B[37m[1/1/2026, 12:00:00 PM]\x1B[0m \x1B[36m[HB Supervisor]\x1B[0m'

    const originalDebugLogging = process.env.UIX_DEBUG_LOGGING

    beforeEach(() => {
      delete process.env.UIX_DEBUG_LOGGING
    })

    afterAll(() => {
      if (originalDebugLogging === undefined) {
        delete process.env.UIX_DEBUG_LOGGING
      } else {
        process.env.UIX_DEBUG_LOGGING = originalDebugLogging
      }
    })

    function emitted(msg: string): string[] {
      const target = new EventEmitter()
      const chunks: string[] = []
      target.on('stdout', (data: string) => chunks.push(data))
      ;(logService as any).emitMessage(target, msg)
      return chunks
    }

    it('strips the level tag from supervisor lines', () => {
      const [out] = emitted(`${supervisor} [INFO] Started Homebridge.\n\r`)

      expect(out).toContain('[HB Supervisor]')
      expect(out).not.toContain('[INFO]')
      expect(out).toContain('Started Homebridge.')
    })

    it('colorizes supervisor SUCCESS/WARN/ERROR content', () => {
      expect(emitted(`${supervisor} [SUCCESS] done\n\r`)[0]).toContain(green('done'))
      expect(emitted(`${supervisor} [WARN] careful\n\r`)[0]).toContain(yellow('careful'))
      expect(emitted(`${supervisor} [ERROR] broken\n\r`)[0]).toContain(red('broken'))
    })

    it('suppresses supervisor DEBUG lines when debug logging is off', () => {
      const chunks = emitted(`${supervisor} [DEBUG] internal detail\n\r`)

      expect(chunks).toHaveLength(0)
    })

    it('keeps supervisor DEBUG lines when UIX_DEBUG_LOGGING is enabled', () => {
      process.env.UIX_DEBUG_LOGGING = '1'

      const [out] = emitted(`${supervisor} [DEBUG] internal detail\n\r`)

      expect(out).toContain('internal detail')
      expect(out).not.toContain('[DEBUG]')
    })

    it('removes only the supervisor DEBUG line from a multi-line chunk', () => {
      const [out] = emitted([
        `${supervisor} [INFO] line one`,
        `${supervisor} [DEBUG] line two`,
        '[1/1/2026, 12:00:00 PM] [homebridge-foo] line three',
        '',
      ].join('\n\r'))

      expect(out).toContain('line one')
      expect(out).not.toContain('line two')
      expect(out).toContain('[homebridge-foo] line three')
    })

    it('does not drop plugin output that happens to contain [DEBUG]', () => {
      const [out] = emitted('[1/1/2026, 12:00:00 PM] [homebridge-foo] payload contained [DEBUG] marker\n\r')

      expect(out).toContain('payload contained [DEBUG] marker')
    })

    it('does not strip or recolour tags in plugin output', () => {
      const line = '[1/1/2026, 12:00:00 PM] [homebridge-foo] upstream said [ERROR] oops\n\r'

      expect(emitted(line)[0]).toBe(line)
    })

    it('suppresses a supervisor DEBUG line split across two chunks', () => {
      const target = new EventEmitter()
      const chunks: string[] = []
      target.on('stdout', (data: string) => chunks.push(data))
      const service = logService as any

      service.emitMessage(target, `${supervisor} [DEB`)
      service.emitMessage(target, 'UG] secret detail\n\r')

      expect(chunks).toHaveLength(0)

      service.emitMessage(target, `${supervisor} [INFO] visible\n\r`)

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toContain('visible')
      expect(chunks[0]).not.toContain('secret detail')
    })

    it('strips the tag from a supervisor line split across two chunks', () => {
      const target = new EventEmitter()
      const chunks: string[] = []
      target.on('stdout', (data: string) => chunks.push(data))
      const service = logService as any

      service.emitMessage(target, `${supervisor} [SUC`)
      service.emitMessage(target, 'CESS] made it\n\r')

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toContain(green('made it'))
      expect(chunks[0]).not.toContain('[SUCCESS]')
    })

    it('emits complete lines immediately while holding the partial remainder', () => {
      const target = new EventEmitter()
      const chunks: string[] = []
      target.on('stdout', (data: string) => chunks.push(data))
      const service = logService as any

      service.emitMessage(target, 'line a\n\rline b partial')

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toBe('line a\n\r')

      service.emitMessage(target, ' now complete\n\r')

      expect(chunks).toHaveLength(2)
      expect(chunks[1]).toBe('line b partial now complete\n\r')
    })

    it('flushes a held partial line after a short idle timeout', async () => {
      const target = new EventEmitter()
      const chunks: string[] = []
      target.on('stdout', (data: string) => chunks.push(data))
      const service = logService as any

      service.emitMessage(target, `${supervisor} [INFO] no trailing newline`)

      expect(chunks).toHaveLength(0)

      await new Promise(res => setTimeout(res, 150))

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toContain('no trailing newline')
      expect(chunks[0]).not.toContain('[INFO]')
    })
  })

  afterAll(async () => {
    await app.close()
  })
})
