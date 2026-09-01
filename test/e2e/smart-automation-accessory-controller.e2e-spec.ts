import type { ServiceType } from '@homebridge/hap-client'

import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { HapSmartAutomationAccessoryController } from '../../src/smart-automation/smart-automation-accessory.controller.js'

function service(uniqueId: string, value: number): ServiceType {
  return {
    uniqueId,
    serviceCharacteristics: [{ type: 'CurrentTemperature', value }],
  } as ServiceType
}

describe('HapSmartAutomationAccessoryController', () => {
  it('shares one HAP monitor, caches event updates and shuts down cleanly', async () => {
    const initial = service('temperature', 20)
    const updated = service('temperature', 24)
    const monitor = Object.assign(new EventEmitter(), { finish: vi.fn() })
    const hapClient = {
      getAllServices: vi.fn(async () => [initial]),
      monitorCharacteristics: vi.fn(async () => monitor),
      destroy: vi.fn(),
    } as any
    const log = { debug: vi.fn(), warn: vi.fn() }
    const controller = new HapSmartAutomationAccessoryController(undefined, log, hapClient)
    const changed: string[][] = []
    controller.onServicesChanged(ids => changed.push([...ids]))

    await controller.start()
    expect(hapClient.getAllServices).toHaveBeenCalledTimes(1)
    expect(hapClient.monitorCharacteristics).toHaveBeenCalledTimes(1)

    monitor.emit('service-update', [updated])
    expect((await controller.getServices())[0].serviceCharacteristics[0].value).toBe(24)
    expect(changed.at(-1)).toEqual(['temperature'])
    expect(hapClient.getAllServices).toHaveBeenCalledTimes(1)

    controller.stop()
    expect(monitor.finish).toHaveBeenCalledTimes(1)
    expect(hapClient.destroy).toHaveBeenCalledTimes(1)
  })
})
