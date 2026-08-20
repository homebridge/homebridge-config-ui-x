import { describe, expect, it, vi } from 'vitest'

import { createSmartAutomationLogger } from '../../src/smart-automation/smart-automation.logger.js'

describe('Smart Automation logger', () => {
  it('uses Homebridge debug logging when local debug is disabled', () => {
    const homebridgeLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
    const log = createSmartAutomationLogger(homebridgeLog, false)

    log.debug('characteristic details')

    expect(homebridgeLog.debug).toHaveBeenCalledWith('characteristic details')
    expect(homebridgeLog.info).not.toHaveBeenCalled()
  })

  it('makes debug details visible when local debug is enabled', () => {
    const homebridgeLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
    const log = createSmartAutomationLogger(homebridgeLog, true)

    log.debug('characteristic details')

    expect(homebridgeLog.info).toHaveBeenCalledWith('[DEBUG] characteristic details')
    expect(homebridgeLog.debug).not.toHaveBeenCalled()
  })
})
