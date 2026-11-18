import { EventEmitter } from 'node:events'
import process from 'node:process'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const { fork } = vi.hoisted(() => ({
  fork: vi.fn(),
}))

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    pid: 1,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  })
}

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  fork,
}))

describe('hb-service stopping', () => {
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

  it('does not start homebridge from a restart that was already scheduled when the stop began', () => {
    // A restart is scheduled 5 seconds after Homebridge ends (20 seconds after start on a Pi Zero). While the
    // UI is still closing (it waits for npm), that timer must not start a Homebridge nobody will stop.
    const helper = Object.create(HomebridgeServiceHelper.prototype) as any
    helper.shuttingDown = true
    helper.homebridgeBinary = process.execPath
    helper.homebridgeOpts = []
    helper.homebridgeCustomEnv = {}
    helper.homebridgePackage = { version: '2.0.0' }
    helper._logger = {
      log: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    }

    fork.mockImplementation(fakeChild)

    helper.runHomebridge()

    expect(fork).not.toHaveBeenCalled()
  })
})
