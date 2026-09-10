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
      removeAfterMinutes: 30,
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
      removeAfterMinutes: 30,
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
      removeAfterMinutes: 30,
      enabled: true,
    }, accessories, { debug: vi.fn(), info: vi.fn(), warn: vi.fn() })

    engine.start(value => published.push(value))
    await vi.waitFor(() => expect(published).toContain(21))
    first.serviceCharacteristics[0].value = 24
    servicesChanged?.(new Set(['one']))
    await vi.waitFor(() => expect(published).toContain(23))

    engine.stop()
  })

  it('actively reads CurrentTemperature through the HAP Client characteristic', async () => {
    const sensor = temperatureSensor('one', 0, 'Backyard Tree')
    const getValue = vi.fn(async () => ({ value: 24.5 }))
    sensor.getCharacteristic = vi.fn(() => ({ getValue }))
    const published: number[] = []
    const engine = new AverageTemperatureRulesEngine({
      id: 'room-average',
      name: 'Room Average',
      type: 'average-temperature',
      uniqueIds: ['one'],
      removeAfterMinutes: 30,
      enabled: true,
    }, {
      getServices: vi.fn(async () => [sensor]),
    }, { debug: vi.fn(), info: vi.fn(), warn: vi.fn() })

    engine.start(value => published.push(value))
    await vi.waitFor(() => expect(published).toContain(24.5))

    expect(sensor.getCharacteristic).toHaveBeenCalledWith('CurrentTemperature')
    expect(getValue).toHaveBeenCalledOnce()
    engine.stop()
  })

  it('removes a sensor after current-temperature refreshes stop succeeding', async () => {
    let now = 0
    const fresh = temperatureSensor('fresh', 20, 'Backyard')
    const stale = temperatureSensor('stale', 10, 'Backyard Tree')
    fresh.getCharacteristic = vi.fn(() => ({ getValue: vi.fn(async () => ({ value: 20 })) }))
    const staleGetValue = vi.fn()
      .mockResolvedValueOnce({ value: 10 })
      .mockResolvedValue(undefined)
    stale.getCharacteristic = vi.fn(() => ({ getValue: staleGetValue }))
    const published: number[] = []
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
    const engine = new AverageTemperatureRulesEngine({
      id: 'room-average',
      name: 'Room Average',
      type: 'average-temperature',
      uniqueIds: ['fresh', 'stale'],
      removeAfterMinutes: 5,
      enabled: true,
    }, {
      getServices: vi.fn(async () => [fresh, stale]),
    }, log, () => now)

    engine.start(value => published.push(value))
    await vi.waitFor(() => expect(published).toContain(15))
    now = 5 * 60_000
    await engine.tick()

    expect(published.at(-1)).toBe(20)
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('Backyard Tree=stale (5 min)'))
    engine.stop()
  })

  it.each(['error', 'empty'])('excludes a failed refresh (%s) immediately and recovers on a successful read', async (failure) => {
    let now = 0
    const healthy = temperatureSensor('healthy', 24)
    healthy.getCharacteristic = () => ({ getValue: async () => ({ value: 24 }) })
    const failing = temperatureSensor('failing', 0, 'Backyard Tree')
    const getValue = vi.fn().mockResolvedValue({ value: 12 })
    failing.getCharacteristic = () => ({ getValue })
    const published: number[] = []
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
    const engine = new AverageTemperatureRulesEngine({
      id: 'average',
      name: 'Average',
      type: 'average-temperature',
      uniqueIds: ['healthy', 'failing'],
      removeAfterMinutes: 5,
    }, { getServices: async () => [healthy, failing] }, log, () => now)
    engine.start(value => published.push(value))
    await vi.waitFor(() => expect(published.at(-1)).toBe(18))
    if (failure === 'error') {
      getValue.mockRejectedValueOnce(new Error('HAP status -70402'))
    } else {
      getValue.mockResolvedValueOnce(undefined)
    }
    await engine.tick()
    expect(published.at(-1)).toBe(24)
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining(`Backyard Tree=${failure === 'error' ? 'error' : 'unavailable'}`))
    now = 6 * 60_000
    getValue.mockRejectedValueOnce(new Error('HAP status -70402'))
    log.debug.mockClear()
    await engine.tick()
    expect(published.at(-1)).toBe(24)
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('Backyard Tree=error'))
    expect(log.debug).not.toHaveBeenCalledWith(expect.stringContaining('Backyard Tree=stale'))
    getValue.mockResolvedValue({ value: 0 })
    await engine.tick()
    expect(published.at(-1)).toBe(12)
    engine.stop()
  })
})
