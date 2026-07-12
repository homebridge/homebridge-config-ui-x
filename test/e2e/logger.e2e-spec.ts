import process from 'node:process'

import { green, red, yellow } from 'bash-color'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../../src/core/logger/logger.service.js'

describe('Logger (e2e)', () => {
  let logger: Logger

  let logSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let debugSpy: ReturnType<typeof vi.spyOn>

  const originalDebugLogging = process.env.UIX_DEBUG_LOGGING

  beforeEach(() => {
    delete process.env.UIX_DEBUG_LOGGING

    logger = new Logger()

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(() => {
    if (originalDebugLogging === undefined) {
      delete process.env.UIX_DEBUG_LOGGING
    } else {
      process.env.UIX_DEBUG_LOGGING = originalDebugLogging
    }
  })

  it('log() writes the plain message with the prefix', () => {
    logger.log('hello')

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Homebridge UI]'), 'hello')
  })

  it('success() writes the message in green', () => {
    logger.success('all good')

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Homebridge UI]'), green('all good'))
  })

  it('warn() writes the message in yellow', () => {
    logger.warn('careful')

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Homebridge UI]'), yellow('careful'))
  })

  it('error() writes the message in red', () => {
    logger.error('broken')

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[Homebridge UI]'), red('broken'))
  })

  it('debug() is suppressed when UIX_DEBUG_LOGGING is not enabled', () => {
    logger.debug('hidden detail')

    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('debug() writes when UIX_DEBUG_LOGGING is enabled', () => {
    process.env.UIX_DEBUG_LOGGING = '1'

    logger.debug('shown detail')

    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('[Homebridge UI]'), green('shown detail'))
  })

  it('verbose() writes regardless of UIX_DEBUG_LOGGING', () => {
    logger.verbose('extra detail')

    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('[Homebridge UI]'), 'extra detail')
  })
})
