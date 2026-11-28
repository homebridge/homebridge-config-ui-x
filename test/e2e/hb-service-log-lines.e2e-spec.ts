import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import process from 'node:process'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { LineBuffer, MAX_HELD_LINE_LENGTH } from '../../src/bin/line-buffer.js'

const { fork } = vi.hoisted(() => ({
  fork: vi.fn(),
}))

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  fork,
}))

describe('hb-service writing homebridge output to the log', () => {
  const argv = process.argv
  let HomebridgeServiceHelper: typeof import('../../src/bin/hb-service.js').HomebridgeServiceHelper

  beforeAll(async () => {
    // Importing hb-service runs its command line: with no command it only prints the help
    process.argv = ['node', 'hb-service']
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
    ;({ HomebridgeServiceHelper } = await import('../../src/bin/hb-service.js'))
    vi.restoreAllMocks()
  })

  afterAll(() => {
    process.argv = argv
  })

  function start() {
    const child = Object.assign(new EventEmitter(), {
      pid: 1,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    })
    fork.mockReturnValue(child)
    const written: string[] = []
    const helper = Object.create(HomebridgeServiceHelper.prototype) as any
    Object.assign(helper, {
      homebridgeBinary: process.execPath,
      homebridgeOpts: [],
      homebridgeCustomEnv: {},
      homebridgePackage: { version: '2.0.0' },
      logFile: {
        write: (text: string) => written.push(text),
      },
      _logger: {
        log: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
      },
      handleHomebridgeClose: vi.fn(),
    })
    helper.runHomebridge()
    return { child, written }
  }

  it('writes output that never ends a line once enough of it is held', () => {
    // Regression: text was held until a newline came. Output that ends its lines in `\r` (ffmpeg's progress) was
    // kept in memory for ever, never reached the log, and every new chunk searched the whole of it again
    const { child, written } = start()

    for (let i = 0; i < 2000; i += 1) {
      child.stdout.emit('data', Buffer.from(`frame=${i} fps=30 time=00:00:01\r`))
    }

    expect(written.join('')).toContain('frame=0 fps=30')
    expect(written.join('').length).toBeGreaterThan(MAX_HELD_LINE_LENGTH)
  })

  it('still writes whole lines, and the rest when homebridge ends', () => {
    const { child, written } = start()

    child.stdout.emit('data', Buffer.from('one\ntw'))
    child.stderr.emit('data', Buffer.from('error line\n'))
    child.stdout.emit('data', Buffer.from('o\nthr'))
    child.emit('close', 0, null)

    expect(written.join('')).toBe('one\nerror line\ntwo\nthr\n')
  })

  it('keeps a character split across two chunks whole', () => {
    const lines: string[] = []
    const buffer = new LineBuffer(text => lines.push(text))
    const euro = Buffer.from('€\n')

    buffer.push(euro.subarray(0, 1))
    buffer.push(euro.subarray(1))

    expect(lines).toEqual(['€\n'])
  })
})
