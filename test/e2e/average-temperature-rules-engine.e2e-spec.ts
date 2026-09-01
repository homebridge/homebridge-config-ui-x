import { describe, expect, it, vi } from 'vitest'

import { averageTemperature, AverageTemperatureRulesEngine } from '../../src/smart-automation/rules/average-temperature.rules-engine.js'

function temperatureSensor(uniqueId: string, value: unknown) {
  return {
    type: 'TemperatureSensor',
    uniqueId,
    serviceName: uniqueId,
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
    const accessories = {
      getServices: vi.fn(async () => [
        temperatureSensor('one', 19),
        temperatureSensor('two', 23),
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
    }, accessories, { debug: vi.fn(), info: vi.fn(), warn: vi.fn() })

    engine.start(value => published.push(value))
    await engine.tick()
    engine.stop()

    expect(published).toContain(21)
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
