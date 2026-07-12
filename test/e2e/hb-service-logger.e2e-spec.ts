import type { LoggerHost } from '../../src/bin/logger.js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../../src/bin/logger.js'

const oraInstance = vi.hoisted(() => ({
  info: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('ora', () => ({
  default: () => oraInstance,
}))

describe('HbServiceLogger (e2e)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  describe('run mode', () => {
    it('should fall back to console.log when no log file is open yet', () => {
      const host: LoggerHost = { action: 'run' }
      const logger = new Logger(host)

      logger.log('storage path check')

      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
      const line = consoleLogSpy.mock.calls[0][0] as string
      expect(line).toContain('[HB Supervisor]')
      expect(line).toContain('[INFO] storage path check')
    })

    it('should pick up a log file opened after the logger was created', () => {
      // Mirrors the real `run` sequence: the logger is first used before
      // startLog() assigns logFile, then again afterwards. The same Logger
      // instance must write to the file once it exists.
      const written: string[] = []
      const host: LoggerHost = { action: 'run' }
      const logger = new Logger(host)

      logger.log('before log file exists')

      host.logFile = { write: (chunk: string) => written.push(chunk) } as unknown as LoggerHost['logFile']
      logger.log('after log file exists')

      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[INFO] before log file exists')
      expect(written).toHaveLength(1)
      expect(written[0]).toContain('[HB Supervisor]')
      expect(written[0]).toContain('[INFO] after log file exists')
      expect(written[0].endsWith('\n')).toBe(true)
    })

    it('should tag each level in the log file output', () => {
      const written: string[] = []
      const host: LoggerHost = {
        action: 'run',
        logFile: { write: (chunk: string) => written.push(chunk) } as unknown as LoggerHost['logFile'],
      }
      const logger = new Logger(host)

      logger.log('a')
      logger.success('b')
      logger.error('c')
      logger.warn('d')
      logger.debug('e')
      logger.verbose('f')

      expect(written).toHaveLength(6)
      expect(written[0]).toContain('[INFO] a')
      expect(written[1]).toContain('[SUCCESS] b')
      expect(written[2]).toContain('[ERROR] c')
      expect(written[3]).toContain('[WARN] d')
      expect(written[4]).toContain('[DEBUG] e')
      expect(written[5]).toContain('[VERBOSE] f')
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('interactive (non-run) mode', () => {
    it('should map levels to the ora spinner methods', () => {
      const host: LoggerHost = { action: 'install' }
      const logger = new Logger(host)

      logger.log('info msg')
      logger.debug('debug msg')
      logger.verbose('verbose msg')
      logger.success('success msg')
      logger.error('error msg')
      logger.warn('warn msg')

      expect(oraInstance.info).toHaveBeenCalledTimes(3)
      expect(oraInstance.info).toHaveBeenCalledWith('info msg')
      expect(oraInstance.info).toHaveBeenCalledWith('debug msg')
      expect(oraInstance.info).toHaveBeenCalledWith('verbose msg')
      expect(oraInstance.succeed).toHaveBeenCalledWith('success msg')
      expect(oraInstance.fail).toHaveBeenCalledWith('error msg')
      expect(oraInstance.warn).toHaveBeenCalledWith('warn msg')
    })

    it('should not write to the log file even when one is open', () => {
      const written: string[] = []
      const host: LoggerHost = {
        action: 'status',
        logFile: { write: (chunk: string) => written.push(chunk) } as unknown as LoggerHost['logFile'],
      }
      const logger = new Logger(host)

      logger.log('status check')

      expect(written).toHaveLength(0)
      expect(oraInstance.info).toHaveBeenCalledWith('status check')
    })
  })
})
