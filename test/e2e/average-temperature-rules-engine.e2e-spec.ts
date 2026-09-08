import { describe, expect, it, vi } from 'vitest'

import { averageTemperature, AverageTemperatureRulesEngine } from '../../src/smart-automation/rules/average-temperature.rules-engine.js'

function temperatureSensor(uniqueId: string, value: unknown, name = uniqueId) {
  return {
    type: 'TemperatureSensor',
    uniqueId,
    serviceName: name,
    serviceCharacteristics: value === undefined
      ? []
      : [{ type: 'CurrentTemperature', value, canWrite: false }],
  } as any
}

describe('averageTemperature', () => {
  it('calculates a one-decimal arithmetic mean', () => {
    expect(averageTemperature([
      temperatureSensor('one', 20),
      temperatureSensor('two', 21),
      temperatureSensor('three', 23),
    ])).toBe(21.3)
  })

  it('ignores sensors without a numeric current value', () => {
    expect(averageTemperature([
      temperatureSensor('one', 20),
      temperatureSensor('missing', undefined),
      temperatureSensor('invalid', 'unknown'),
    ])).toBe(20)
  })
})

describe('AverageTemperatureRulesEngine', () => {
  it('publishes the average of only the configured sensors', async () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
    const accessories = {
      getServices: vi.fn(async () => [
        temperatureSensor('one', 19, 'Backyard North'),
        temperatureSensor('two', 23, 'Backyard South'),
        temperatureSensor('not-selected', 99),
      ]),
    }
    const published: number[] = []
    const engine = new AverageTemperatureRulesEngine({
      id: 'room-average',
      name: 'Room Average',
      type: 'average-temperature',
      uniqueIds: ['one', 'two'],
      enabled: true,
    }, accessories, log)

    engine.start(value => published.push(value))
    await engine.tick()
    engine.stop()

    expect(published).toContain(21)
    expect(log.debug).toHaveBeenCalledWith(
      'Room Average: inputs [Backyard North=19°C, Backyard South=23°C]; averaged 2 of 2 resolved sensors to 21°C.',
    )
  })

  it('identifies resolved sensors whose readings are unavailable', async () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
    const engine = new AverageTemperatureRulesEngine({
      id: 'room-average',
      name: 'Room Average',
      type: 'average-temperature',
      uniqueIds: ['one', 'missing'],
      enabled: true,
    }, {
      getServices: vi.fn(async () => [
        temperatureSensor('one', 20, 'Backyard'),
        temperatureSensor('missing', undefined, 'Patio'),
      ]),
    }, log)

    await engine.tick()

    expect(log.debug).toHaveBeenCalledWith(
      'Room Average: inputs [Backyard=20°C, Patio=unavailable]; averaged 1 of 2 resolved sensors to 20°C.',
    )
  })

  it('publishes a new average when a selected sensor sends a HAP Event', async () => {
    const first = temperatureSensor('one', 20)
    const second = temperatureSensor('two', 22)
    let servicesChanged: ((changedUniqueIds: ReadonlySet<string>) => void) | undefined
    const accessories = {
      getServices: vi.fn(async () => [first, second]),
      onServicesChanged: vi.fn((listener) => {
        servicesChanged = listener
        return vi.fn()
      }),
    }
    const published: number[] = []
    const engine = new AverageTemperatureRulesEngine({
      id: 'room-average',
      name: 'Room Average',
      type: 'average-temperature',
      uniqueIds: ['one', 'two'],
      enabled: true,
    }, accessories, { debug: vi.fn(), info: vi.fn(), warn: vi.fn() })

    engine.start(value => published.push(value))
    await vi.waitFor(() => expect(published).toContain(21))
    first.serviceCharacteristics[0].value = 24
    servicesChanged?.(new Set(['one']))
    await vi.waitFor(() => expect(published).toContain(23))

    engine.stop()
  })
})
