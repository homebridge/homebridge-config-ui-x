import process from 'node:process'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

describe('the unhandled rejection handler of the ui', () => {
  let handleUnhandledRejection: (err: any) => void

  beforeAll(async () => {
    ;({ handleUnhandledRejection } = await import('../../src/self-check.js'))
  })

  afterAll(() => {
    // Importing it adds the handler to this test process: take it off again
    process.removeListener('unhandledRejection', handleUnhandledRejection)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function run(err: unknown) {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
    handleUnhandledRejection(err)
    vi.runAllTimers()
    return exit
  }

  it.each([undefined, null])('copes with a promise rejected with %s', (err) => {
    // Regression: `err.toString()` threw here, and a throw in this handler ends the process
    expect(() => run(err)).not.toThrow()
  })

  it('ends the ui for a port that is already in use', () => {
    const exit = run(Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE', syscall: 'listen', port: 8581 }))
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('does not end the ui for a file it may not read, which is not a port problem', () => {
    // Regression: any EACCES ended the process, as if the port were the problem
    const exit = run(Object.assign(new Error('EACCES: permission denied, open'), { code: 'EACCES', syscall: 'open' }))
    expect(exit).not.toHaveBeenCalled()
  })
})
