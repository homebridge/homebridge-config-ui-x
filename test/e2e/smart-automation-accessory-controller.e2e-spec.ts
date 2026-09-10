import type { ServiceType } from '@homebridge/hap-client'

import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HapSmartAutomationAccessoryController } from '../../src/smart-automation/smart-automation-accessory.controller.js'

function service(uniqueId: string, value: number): ServiceType {
  return { uniqueId, serviceCharacteristics: [{ type: 'CurrentTemperature', value }] } as ServiceType
}

function setup(ids = ['temperature']) {
  const selected = service('temperature', 20)
  const unrelated = service('unrelated', 10)
  const monitor = Object.assign(new EventEmitter(), { finish: vi.fn() })
  const client = Object.assign(new EventEmitter(), {
    getAllServices: vi.fn(async () => [selected, unrelated]),
    monitorCharacteristics: vi.fn(async () => monitor),
    destroy: vi.fn(),
  })
  const factory = vi.fn(() => client as any)
  const log = { debug: vi.fn(), warn: vi.fn() }
  const controller = new HapSmartAutomationAccessoryController(undefined, log, new Set(ids), factory)
  return { selected, unrelated, monitor, client, factory, controller, log }
}

async function start(controller: HapSmartAutomationAccessoryController) {
  const pending = controller.start()
  await vi.advanceTimersByTimeAsync(20_000)
  await pending
}

describe('HapSmartAutomationAccessoryController', () => {
  beforeEach(() => vi.useFakeTimers())

  afterEach(() => vi.useRealTimers())

  it('shares a scoped monitor and caches only selected service events', async () => {
    const { controller, client, monitor, selected, log } = setup()
    const listener = vi.fn()
    controller.onServicesChanged(listener)
    try {
      await start(controller)
      expect(client.monitorCharacteristics).toHaveBeenCalledExactlyOnceWith([selected])
      const updated = service('temperature', 24)
      monitor.emit('service-update', [updated, service('unrelated', 30)])
      expect(await controller.getServices()).toEqual([updated])
      expect(listener).toHaveBeenLastCalledWith(new Set(['temperature']))
      expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('CurrentTemperature=24'))
      expect(client.getAllServices).toHaveBeenCalledTimes(1)
    } finally {
      controller.stop()
    }
    expect(monitor.finish).toHaveBeenCalledOnce()
    expect(client.destroy).toHaveBeenCalledOnce()
  })

  it('delays discovery and resets the settling window on new instances', async () => {
    const { controller, client, factory } = setup()
    try {
      const first = controller.start()
      const second = controller.start()
      await vi.advanceTimersByTimeAsync(14_999)
      expect(factory).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(4_001)
      client.emit('instance-discovered')
      await vi.advanceTimersByTimeAsync(4_999)
      expect(client.getAllServices).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      await Promise.all([first, second])
      expect(factory).toHaveBeenCalledOnce()
      expect(client.getAllServices).toHaveBeenCalledOnce()
    } finally {
      controller.stop()
    }
  })

  it('adds missing services after later discovery without waiting five minutes', async () => {
    const { controller, client, selected, unrelated } = setup()
    client.getAllServices.mockResolvedValueOnce([unrelated])
    try {
      await start(controller)
      expect(client.monitorCharacteristics).not.toHaveBeenCalled()
      client.emit('instance-discovered')
      await vi.advanceTimersByTimeAsync(5_000)
      expect(client.monitorCharacteristics).toHaveBeenCalledExactlyOnceWith([selected])
    } finally {
      controller.stop()
    }
  })

  it('reconciles periodically and retries monitor failures after five seconds', async () => {
    const { controller, client, monitor, selected } = setup()
    try {
      await start(controller)
      await vi.advanceTimersByTimeAsync(300_000)
      expect(client.monitorCharacteristics).toHaveBeenCalledTimes(2)
      monitor.emit('monitor-close', { username: 'bridge' }, true)
      await vi.advanceTimersByTimeAsync(5_000)
      expect(client.monitorCharacteristics).toHaveBeenCalledTimes(3)
      expect(client.monitorCharacteristics).toHaveBeenLastCalledWith([selected])
    } finally {
      controller.stop()
    }
  })

  it.each([0, 16_000])('cancels startup on shutdown after %i ms', async (elapsed) => {
    const { controller, client, factory } = setup()
    const pending = controller.start()
    await vi.advanceTimersByTimeAsync(elapsed)
    controller.stop()
    await pending
    await vi.advanceTimersByTimeAsync(300_000)
    expect(factory).toHaveBeenCalledTimes(elapsed ? 1 : 0)
    expect(client.getAllServices).not.toHaveBeenCalled()
    expect(client.listenerCount('instance-discovered')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('skips discovery when no enabled automation needs services', async () => {
    const { controller, factory } = setup([])
    await controller.start()
    expect(factory).not.toHaveBeenCalled()
    controller.stop()
  })
})
