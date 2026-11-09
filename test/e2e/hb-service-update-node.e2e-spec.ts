import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { confirmUnsupportedNode } from '../../src/bin/confirm-unsupported-node.js'

const { question } = vi.hoisted(() => ({
  question: vi.fn(),
}))

vi.mock('node:readline/promises', () => ({
  createInterface: () => ({
    question,
    close: vi.fn(),
  }),
}))

/**
 * Installing a release this system does not support can leave node unable to
 * start, so it has to be confirmed by someone at a terminal.
 */
describe('confirming an unsupported node.js release', () => {
  const originalIsTTY = process.stdin.isTTY
  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
  }

  const setTerminal = (value: boolean) => {
    Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true })
  })

  it('warns and refuses when nobody is at a terminal to agree', async () => {
    setTerminal(false)
    expect(await confirmUnsupportedNode('v26.13.0', logger)).toBe(false)
    expect(question).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not supported on this system'))
    expect(logger.error).toHaveBeenCalledWith('Node.js was not changed.')
  })

  it.each(['', 'n', 'no', 'maybe'])('refuses when the answer is "%s"', async (answer) => {
    setTerminal(true)
    question.mockResolvedValue(answer)
    expect(await confirmUnsupportedNode('v26.13.0', logger)).toBe(false)
  })

  it.each(['y', 'Y', 'yes', ' yes '])('agrees when the answer is "%s"', async (answer) => {
    setTerminal(true)
    question.mockResolvedValue(answer)
    expect(await confirmUnsupportedNode('v26.13.0', logger)).toBe(true)
    expect(logger.error).not.toHaveBeenCalled()
  })
})
