import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { gracefulShutdown } from '../../src/bin/shutdown.js'

function fakeHomebridge(stopsAfterMs: number | null) {
  const child = new EventEmitter() as any
  child.exitCode = null
  child.signalCode = null
  child.kill = vi.fn((signal: string) => {
    if (signal === 'SIGTERM' && stopsAfterMs !== null) {
      setTimeout(() => {
        child.signalCode = 'SIGTERM'
        child.emit('close', null, 'SIGTERM')
      }, stopsAfterMs)
    }
    return true
  })
  return child
}

describe('stopping hb-service', () => {
  it('waits for homebridge to stop before it closes the ui', async () => {
    const order: string[] = []
    const child = fakeHomebridge(50)
    child.once('close', () => order.push('homebridge stopped'))

    await gracefulShutdown({
      child,
      closeUi: async () => {
        order.push('ui closed')
      },
      killAfterMs: 2000,
    })

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(child.kill).not.toHaveBeenCalledWith('SIGKILL')
    expect(order).toEqual(['homebridge stopped', 'ui closed'])
  })

  it('kills a homebridge that does not stop in time', async () => {
    const child = fakeHomebridge(null)
    const closeUi = vi.fn(async () => {})

    await gracefulShutdown({ child, closeUi, killAfterMs: 50 })

    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(closeUi).toHaveBeenCalledOnce()
  })

  it('does not wait for a homebridge that has already ended', async () => {
    const child = fakeHomebridge(null)
    child.exitCode = 1

    await gracefulShutdown({ child, killAfterMs: 5000 })

    expect(child.kill).not.toHaveBeenCalled()
  })

  it('still closes the ui when there is no homebridge, and when closing fails', async () => {
    const log = vi.fn()
    await expect(gracefulShutdown({
      closeUi: async () => {
        throw new Error('busy')
      },
      log,
    })).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('busy'))
  })
})
