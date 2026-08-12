import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { HttpService } from '@nestjs/axios'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigService } from '../../src/core/config/config.service.js'
import { HomebridgeIpcService } from '../../src/core/homebridge-ipc/homebridge-ipc.service.js'
import { Logger } from '../../src/core/logger/logger.service.js'
import { PluginsService } from '../../src/modules/plugins/plugins.service.js'
import { ServerService } from '../../src/modules/server/server.service.js'
import { StatusService } from '../../src/modules/status/status.service.js'

const { cpuTemperatureMock } = vi.hoisted(() => ({
  cpuTemperatureMock: vi.fn(),
}))

vi.mock('systeminformation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('systeminformation')>()
  return {
    ...actual,
    cpuTemperature: cpuTemperatureMock,
  }
})

describe('StatusService - getCpuTemp', () => {
  let statusService: StatusService
  let configService: ConfigService
  let logger: Logger
  const tempDir = resolve(__dirname, '../', '.homebridge', 'cpu-temp')

  beforeAll(async () => {
    await mkdir(tempDir, { recursive: true })
  })

  beforeEach(() => {
    vi.resetAllMocks()

    logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger

    configService = {
      ui: { disableServerMetricsMonitoring: true },
    } as unknown as ConfigService

    statusService = new StatusService(
      new HttpService(),
      logger,
      configService,
      {} as PluginsService,
      {} as ServerService,
      { on: vi.fn() } as unknown as HomebridgeIpcService,
    )
  })

  afterAll(async () => {
    await rm(tempDir, { force: true, recursive: true })
  })

  /**
   * Writes the given contents to a temp file and points `ui.temp` at it
   */
  const useTempFile = async (contents: string) => {
    const tempFile = resolve(tempDir, `temp-${Math.random().toString(36).slice(2)}`)
    await writeFile(tempFile, contents, 'utf-8')
    configService.ui.temp = tempFile
    return tempFile
  }

  /**
   * Calls the private temperature lookup the cpu status endpoint is built on
   */
  const getCpuTemp = async () => {
    // @ts-expect-error - accessing private method for testing
    return statusService.getCpuTemp() as Promise<{ main: number, cores: number[], max: number }>
  }

  it('should prefer the configured temp file over systeminformation', async () => {
    // Auto-detection can read the wrong sensor entirely, so an explicitly
    // configured file must always win, even when cpuTemperature() succeeds
    cpuTemperatureMock.mockResolvedValue({ main: 88, cores: [88], max: 88 })
    await useTempFile('47000')

    const cpuTemperature = await getCpuTemp()

    expect(cpuTemperature.main).toBe(47)
    expect(cpuTemperature.max).toBe(47)
    expect(cpuTemperatureMock).not.toHaveBeenCalled()
  })

  it('should use systeminformation when no temp file is configured', async () => {
    cpuTemperatureMock.mockResolvedValue({ main: 88, cores: [88], max: 88 })

    const cpuTemperature = await getCpuTemp()

    expect(cpuTemperature.main).toBe(88)
    expect(cpuTemperatureMock).toHaveBeenCalled()
  })

  describe('temp file parsing', () => {
    const cases: [string, string, number][] = [
      ['whole millidegrees', '47000', 47],
      ['fractional millidegrees', '47500', 47.5],
      ['whole degrees', '47', 47],
      ['fractional degrees', '47.5', 47.5],
      ['a trailing newline', '47000\n', 47],
      ['sub-zero millidegrees', '-5000', -5],
      ['sub-zero degrees', '-5', -5],
    ]

    it.each(cases)('should read %s as %s -> %s°C', async (_label, contents, expected) => {
      await useTempFile(contents)

      const cpuTemperature = await getCpuTemp()

      expect(cpuTemperature.main).toBe(expected)
      expect(cpuTemperature.max).toBe(expected)
      expect(cpuTemperature.cores).toEqual([])
    })
  })

  describe('temp file fallbacks', () => {
    const cases: [string, string][] = [
      ['does not contain a number', 'abc'],
      ['is empty', ''],
      // Infinity and -Infinity survive parseFloat, so they need rejecting too,
      // else the widget renders a temperature of "Infinity°C"
      ['reads as infinity', 'Infinity'],
      ['reads as negative infinity', '-Infinity'],
    ]

    it.each(cases)('should fall back when the file %s', async (_label, contents) => {
      await useTempFile(contents)

      const cpuTemperature = await getCpuTemp()

      expect(cpuTemperature.main).toBe(-1)
      expect(cpuTemperature.max).toBe(-1)
      expect(logger.error).toHaveBeenCalled()
    })

    it('should fall back when the file does not exist', async () => {
      configService.ui.temp = resolve(tempDir, 'does-not-exist')

      const cpuTemperature = await getCpuTemp()

      expect(cpuTemperature.main).toBe(-1)
      expect(cpuTemperature.max).toBe(-1)
      expect(logger.error).toHaveBeenCalled()
    })
  })
})
