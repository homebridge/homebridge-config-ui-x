import { describe, expect, it, vi } from 'vitest'

import { clampHumidity, currentHumidity, HumidityControlRulesEngine } from '../../src/smart-automation/rules/humidity-control.rules-engine.js'

function characteristic(type: string, value: string | number | boolean, canWrite = false) {
  const item = {
    type,
    value,
    canWrite,
    setValue: vi.fn(async (next: string | number | boolean) => {
      item.value = next
    }),
  }
  return item
}

function service(type: string, uniqueId: string, characteristics: ReturnType<typeof characteristic>[]) {
  return {
    type,
    uniqueId,
    serviceName: uniqueId,
    serviceCharacteristics: characteristics,
    getCharacteristic: vi.fn(characteristicType => characteristics.find(item => item.type === characteristicType)),
  } as any
}

describe('humidity helpers', () => {
  it('clamps humidity to a valid percentage', () => {
    expect(clampHumidity(61.4, 50)).toBe(61)
    expect(clampHumidity(150, 50)).toBe(100)
    expect(clampHumidity('invalid', 50)).toBe(50)
  })

  it('reads current relative humidity', () => {
    expect(currentHumidity(service('HumiditySensor', 'sensor', [characteristic('CurrentRelativeHumidity', 62)]))).toBe(62)
  })
})

describe('HumidityControlRulesEngine', () => {
  const config = {
    id: 'basement-ac',
    name: 'Basement AC',
    type: 'humidity-control' as const,
    uniqueIds: ['humidity'],
    targetUniqueId: 'ac',
    onHumidity: 60,
    offHumidity: 50,
    enabled: true,
  }

  it('turns a HeaterCooler on above the high threshold and off below the low threshold', async () => {
    const humidity = characteristic('CurrentRelativeHumidity', 61)
    const active = characteristic('Active', 0, true)
    const accessories = { getServices: vi.fn(async () => [
      service('HumiditySensor', 'humidity', [humidity]),
      service('HeaterCooler', 'ac', [active]),
    ]) }
    const engine = new HumidityControlRulesEngine(config, accessories, { debug: vi.fn(), info: vi.fn(), warn: vi.fn() })

    await engine.tick()
    expect(active.value).toBe(1)

    humidity.value = 55
    await engine.tick()
    expect(active.value).toBe(1)
    expect(active.setValue).toHaveBeenCalledTimes(1)

    humidity.value = 49
    await engine.tick()
    expect(active.value).toBe(0)
  })

  it('uses cooling mode for a thermostat target', async () => {
    const humidity = characteristic('CurrentRelativeHumidity', 75)
    const mode = characteristic('TargetHeatingCoolingState', 0, true)
    const accessories = { getServices: vi.fn(async () => [
      service('HumiditySensor', 'humidity', [humidity]),
      service('Thermostat', 'ac', [mode]),
    ]) }
    const engine = new HumidityControlRulesEngine(config, accessories, { debug: vi.fn(), info: vi.fn(), warn: vi.fn() })

    await engine.tick()

    expect(mode.value).toBe(2)
  })

  it('takes no action at either threshold or inside the hysteresis band', async () => {
    const humidity = characteristic('CurrentRelativeHumidity', 60)
    const on = characteristic('On', false, true)
    const accessories = { getServices: vi.fn(async () => [
      service('HumiditySensor', 'humidity', [humidity]),
      service('Switch', 'ac', [on]),
    ]) }
    const engine = new HumidityControlRulesEngine(config, accessories, { debug: vi.fn(), info: vi.fn(), warn: vi.fn() })

    await engine.tick()
    humidity.value = 50
    await engine.tick()

    expect(on.setValue).not.toHaveBeenCalled()
  })

  it('reacts to a HAP Event for the configured humidity sensor', async () => {
    const humidity = characteristic('CurrentRelativeHumidity', 55)
    const on = characteristic('On', false, true)
    let servicesChanged: ((changedUniqueIds: ReadonlySet<string>) => void) | undefined
    const accessories = {
      getServices: vi.fn(async () => [
        service('HumiditySensor', 'humidity', [humidity]),
        service('Switch', 'ac', [on]),
      ]),
      onServicesChanged: vi.fn((listener) => {
        servicesChanged = listener
        return vi.fn()
      }),
    }
    const engine = new HumidityControlRulesEngine(config, accessories, { debug: vi.fn(), info: vi.fn(), warn: vi.fn() })

    engine.start(() => undefined)
    await vi.waitFor(() => expect(accessories.getServices).toHaveBeenCalled())
    humidity.value = 70
    servicesChanged?.(new Set(['humidity']))
    await vi.waitFor(() => expect(on.value).toBe(true))

    engine.stop()
  })
})
