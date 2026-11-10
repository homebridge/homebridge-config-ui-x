import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { confirmUnknownNode } from '../../src/bin/confirm-unknown-node.js'

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
 * A major version newer than those Homebridge knows about might work, but nobody
 * has checked, so it has to be confirmed by someone at a terminal.
 */
describe('confirming a node.js release newer than homebridge knows about', () => {
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
    expect(await confirmUnknownNode('v28.0.0', logger)).toBe(false)
    expect(question).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('uncharted waters'))
    expect(logger.error).toHaveBeenCalledWith('Node.js was not changed.')
  })

  it.each(['', 'n', 'no', 'maybe'])('refuses when the answer is "%s"', async (answer) => {
    setTerminal(true)
    question.mockResolvedValue(answer)
    expect(await confirmUnknownNode('v28.0.0', logger)).toBe(false)
  })

  it('refuses when the prompt is closed without an answer', async () => {
    setTerminal(true)
    question.mockRejectedValue(new Error('Aborted'))
    expect(await confirmUnknownNode('v28.0.0', logger)).toBe(false)
    expect(logger.error).toHaveBeenCalledWith('Node.js was not changed.')
  })

  it.each(['y', 'Y', 'yes', ' yes '])('agrees when the answer is "%s"', async (answer) => {
    setTerminal(true)
    question.mockResolvedValue(answer)
    expect(await confirmUnknownNode('v28.0.0', logger)).toBe(true)
    expect(logger.error).not.toHaveBeenCalled()
  })
})
